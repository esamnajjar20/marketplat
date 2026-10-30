package notificationdigest

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

var digestDriverSequence atomic.Int64

type scriptedDigestDriver struct {
	results [][]driver.Value
	queries []string
	args    [][]driver.NamedValue
}

type scriptedDigestConn struct{ script *scriptedDigestDriver }
type scriptedDigestRows struct {
	values []driver.Value
	done   bool
}

func (d *scriptedDigestDriver) Open(string) (driver.Conn, error) {
	return &scriptedDigestConn{script: d}, nil
}
func (c *scriptedDigestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not implemented")
}
func (c *scriptedDigestConn) Close() error              { return nil }
func (c *scriptedDigestConn) Begin() (driver.Tx, error) { return nil, errors.New("not implemented") }
func (c *scriptedDigestConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.script.queries = append(c.script.queries, query)
	c.script.args = append(c.script.args, append([]driver.NamedValue(nil), args...))
	if len(c.script.results) == 0 {
		return nil, errors.New("unexpected query")
	}
	values := c.script.results[0]
	c.script.results = c.script.results[1:]
	return &scriptedDigestRows{values: values}, nil
}
func (r *scriptedDigestRows) Columns() []string {
	return []string{"lastUserId", "digestsCreated", "rowsMarkedRead"}
}
func (r *scriptedDigestRows) Close() error { return nil }
func (r *scriptedDigestRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	copy(dest, r.values)
	return nil
}

func openScriptedDigestDB(t *testing.T, results [][]driver.Value) (*sql.DB, *scriptedDigestDriver) {
	t.Helper()
	name := "marketplat-notification-digest-" + strings.ReplaceAll(t.Name(), "/", "-") + "-" + strconv.FormatInt(digestDriverSequence.Add(1), 10)
	script := &scriptedDigestDriver{results: results}
	sql.Register(name, script)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunUsesKeysetBatchesAndAggregatesDatabaseSide(t *testing.T) {
	db, script := openScriptedDigestDB(t, [][]driver.Value{
		{"user-a", int64(100), int64(540)},
		{"user-b", int64(20), int64(87)},
		{nil, int64(0), int64(0)},
	})
	now := time.Date(2026, time.October, 30, 8, 0, 0, 0, time.FixedZone("test", 2*60*60))

	result, err := Run(context.Background(), db, 100, now)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.DigestsCreated != 120 || result.RowsMarkedRead != 627 || result.Batches != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(script.queries) != 3 {
		t.Fatalf("query count = %d, want 3", len(script.queries))
	}
	for _, required := range []string{
		`n."readAt" IS NULL`,
		`n."data"->'digest' IS DISTINCT FROM 'true'::jsonb`,
		`GROUP BY e."userId"`,
		`HAVING COUNT(*) >= 2`,
		`ORDER BY n."userId" ASC`,
		`LIMIT $2`,
		`INSERT INTO "notifications"`,
		`'ملخص إشعاراتك'`,
		`'digest', TRUE`,
		`'sourceIds'`,
		`ROW_NUMBER() OVER`,
		`FILTER (WHERE e.source_rank <= 50)`,
		`UPDATE "notifications" AS n`,
		`SET "readAt" = $3`,
	} {
		if !strings.Contains(script.queries[0], required) {
			t.Fatalf("digest SQL missing %q", required)
		}
	}

	if script.args[0][0].Value != "" || script.args[1][0].Value != "user-a" || script.args[2][0].Value != "user-b" {
		t.Fatalf("keyset cursors are incorrect: %#v", script.args)
	}
	for i, args := range script.args {
		if len(args) != 3 {
			t.Fatalf("query %d args length = %d, want 3", i, len(args))
		}
		if args[1].Value != int64(100) {
			t.Fatalf("query %d batch size = %#v, want 100", i, args[1].Value)
		}
		gotNow, ok := args[2].Value.(time.Time)
		if !ok || !gotNow.Equal(now.UTC()) {
			t.Fatalf("query %d now = %#v, want %s", i, args[2].Value, now.UTC())
		}
	}
}

func TestRunRejectsInvalidBatchSizeBeforeDatabaseAccess(t *testing.T) {
	for _, size := range []int{0, -1, MaxBatchSize + 1} {
		if _, err := Run(context.Background(), nil, size, time.Now()); err == nil {
			t.Fatalf("expected invalid batch size %d to fail", size)
		}
	}
}

func TestRunRejectsNonAdvancingCursor(t *testing.T) {
	db, _ := openScriptedDigestDB(t, [][]driver.Value{
		{"user-a", int64(1), int64(2)},
		{"user-a", int64(1), int64(2)},
	})
	_, err := Run(context.Background(), db, 100, time.Now())
	if err == nil || !strings.Contains(err.Error(), "cursor did not advance") {
		t.Fatalf("expected cursor progress error, got %v", err)
	}
}
