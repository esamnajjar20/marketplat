package failedtaskretention

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

var testDriverSequence atomic.Int64

type scriptedDriver struct {
	responses [][]string
	queries   []string
	args      [][]driver.NamedValue
}

type scriptedConn struct{ script *scriptedDriver }

type scriptedRows struct {
	ids []string
	i   int
}

func (d *scriptedDriver) Open(string) (driver.Conn, error) {
	return &scriptedConn{script: d}, nil
}

func (c *scriptedConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not implemented")
}
func (c *scriptedConn) Close() error              { return nil }
func (c *scriptedConn) Begin() (driver.Tx, error) { return nil, errors.New("not implemented") }

func (c *scriptedConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.script.queries = append(c.script.queries, query)
	c.script.args = append(c.script.args, append([]driver.NamedValue(nil), args...))
	if len(c.script.responses) == 0 {
		return nil, errors.New("unexpected query")
	}
	ids := c.script.responses[0]
	c.script.responses = c.script.responses[1:]
	return &scriptedRows{ids: ids}, nil
}

func (r *scriptedRows) Columns() []string { return []string{"id"} }
func (r *scriptedRows) Close() error      { return nil }
func (r *scriptedRows) Next(dest []driver.Value) error {
	if r.i >= len(r.ids) {
		return io.EOF
	}
	dest[0] = r.ids[r.i]
	r.i++
	return nil
}

func openScriptedDB(t *testing.T, responses [][]string) (*sql.DB, *scriptedDriver) {
	t.Helper()
	name := "marketplat-failed-task-retention-" + strings.ReplaceAll(t.Name(), "/", "-") + "-" + strconv.FormatInt(testDriverSequence.Add(1), 10)
	script := &scriptedDriver{responses: responses}
	sql.Register(name, script)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunDeletesResolvedTasksInBoundedBatches(t *testing.T) {
	db, script := openScriptedDB(t, [][]string{
		{"task-1", "task-2"},
		{"task-3"},
	})
	now := time.Date(2026, time.October, 30, 13, 0, 0, 0, time.FixedZone("test", 2*60*60))

	result, err := Run(context.Background(), db, 30, 2, now)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Deleted != 3 || result.Batches != 2 {
		t.Fatalf("unexpected totals: deleted=%d batches=%d", result.Deleted, result.Batches)
	}
	if result.RetentionDays != 30 {
		t.Fatalf("retentionDays = %d, want 30", result.RetentionDays)
	}
	wantCutoff := now.UTC().Add(-30 * 24 * time.Hour)
	if !result.Cutoff.Equal(wantCutoff) {
		t.Fatalf("cutoff = %s, want %s", result.Cutoff, wantCutoff)
	}
	if len(script.queries) != 2 {
		t.Fatalf("query count = %d, want 2", len(script.queries))
	}

	for i, query := range script.queries {
		for _, required := range []string{
			`FROM "failed_background_tasks"`,
			`"resolved" = TRUE`,
			`"resolvedAt" IS NOT NULL`,
			`"resolvedAt" < $1`,
			`ORDER BY "resolvedAt" ASC, id ASC`,
			`LIMIT $2`,
			`FOR UPDATE SKIP LOCKED`,
		} {
			if !strings.Contains(query, required) {
				t.Fatalf("query %d missing %q: %s", i, required, query)
			}
		}
		if strings.Contains(query, `"resolved" = FALSE`) {
			t.Fatalf("query %d must never target unresolved rows: %s", i, query)
		}
		if len(script.args[i]) != 2 {
			t.Fatalf("query %d args length = %d, want 2", i, len(script.args[i]))
		}
		gotCutoff, ok := script.args[i][0].Value.(time.Time)
		if !ok || !gotCutoff.Equal(wantCutoff) {
			t.Fatalf("query %d cutoff = %#v, want %s", i, script.args[i][0].Value, wantCutoff)
		}
		if script.args[i][1].Value != int64(2) {
			t.Fatalf("query %d batch size = %#v, want 2", i, script.args[i][1].Value)
		}
	}
}

func TestRunStopsAfterEmptyBatchWhenPreviousBatchWasFull(t *testing.T) {
	db, script := openScriptedDB(t, [][]string{
		{"task-1", "task-2"},
		{},
	})
	result, err := Run(context.Background(), db, 30, 2, time.Now())
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Deleted != 2 || result.Batches != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(script.queries) != 2 {
		t.Fatalf("query count = %d, want 2", len(script.queries))
	}
}

func TestRunRejectsInvalidLimitsBeforeDatabaseAccess(t *testing.T) {
	for _, tc := range []struct {
		name          string
		retentionDays int
		batchSize     int
	}{
		{name: "zero days", retentionDays: 0, batchSize: 500},
		{name: "too many days", retentionDays: MaxRetentionDays + 1, batchSize: 500},
		{name: "zero batch", retentionDays: 30, batchSize: 0},
		{name: "too large batch", retentionDays: 30, batchSize: MaxBatchSize + 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Run(context.Background(), nil, tc.retentionDays, tc.batchSize, time.Now()); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}
