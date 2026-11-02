package analyticsretention

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

func TestRunRejectsInvalidRetentionDaysBeforeDatabaseAccess(t *testing.T) {
	for _, days := range []int{0, -1, 3651} {
		t.Run(time.Duration(days).String(), func(t *testing.T) {
			_, err := Run(context.Background(), nil, days, DefaultBatchSize, time.Now())
			if err == nil {
				t.Fatalf("expected invalid retention days %d to fail", days)
			}
		})
	}
}

func TestRunRejectsInvalidBatchSizeBeforeDatabaseAccess(t *testing.T) {
	for _, size := range []int{0, -1, 50001} {
		_, err := Run(context.Background(), nil, 90, size, time.Now())
		if err == nil {
			t.Fatalf("expected invalid batch size %d to fail", size)
		}
	}
}

// The standard-library-only fake driver lets us exercise batch termination
// without a live PostgreSQL server.
type scriptedDriver struct {
	batches [][]string
	queries []string
	args    [][]driver.NamedValue
}

type scriptedConn struct {
	owner   *scriptedDriver
	batches [][]string
	next    int
}

type scriptedRows struct {
	ids []string
	i   int
}

func (d *scriptedDriver) Open(string) (driver.Conn, error) {
	return &scriptedConn{owner: d, batches: d.batches}, nil
}

func (c *scriptedConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not implemented")
}
func (c *scriptedConn) Close() error              { return nil }
func (c *scriptedConn) Begin() (driver.Tx, error) { return nil, errors.New("not implemented") }

func (c *scriptedConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.owner.queries = append(c.owner.queries, query)
	c.owner.args = append(c.owner.args, append([]driver.NamedValue(nil), args...))
	if c.next >= len(c.batches) {
		return &scriptedRows{}, nil
	}
	ids := c.batches[c.next]
	c.next++
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

func TestRunWorksOnPinnedConnection(t *testing.T) {
	name := "marketplat-analytics-retention-pinned-connection"
	driverInstance := &scriptedDriver{batches: [][]string{{"a"}}}
	sql.Register(name, driverInstance)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake database: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatalf("get pinned connection: %v", err)
	}
	defer conn.Close()

	result, err := Run(context.Background(), conn, 30, 2, time.Now())
	if err != nil {
		t.Fatalf("Run with pinned connection returned error: %v", err)
	}
	if result.Deleted != 1 || result.Batches != 1 {
		t.Fatalf("unexpected result: deleted=%d batches=%d", result.Deleted, result.Batches)
	}
}

func TestRunDeletesInBoundedBatchesUntilShortBatch(t *testing.T) {
	name := "marketplat-analytics-retention-scripted"
	driverInstance := &scriptedDriver{batches: [][]string{{"a", "b"}, {"c"}}}
	sql.Register(name, driverInstance)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake database: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	now := time.Date(2026, time.October, 28, 12, 0, 0, 0, time.FixedZone("test", 2*60*60))
	result, err := Run(context.Background(), db, 30, 2, now)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Deleted != 3 || result.Batches != 2 {
		t.Fatalf("unexpected result: deleted=%d batches=%d", result.Deleted, result.Batches)
	}
	wantCutoff := now.UTC().Add(-30 * 24 * time.Hour)
	if !result.Cutoff.Equal(wantCutoff) {
		t.Fatalf("unexpected cutoff: got %s want %s", result.Cutoff, wantCutoff)
	}
	if len(driverInstance.queries) == 0 || !strings.Contains(driverInstance.queries[0], `"analytics_rollup_days"`) {
		t.Fatal("retention delete query must require completed daily rollup coverage")
	}
	if len(driverInstance.args) == 0 || len(driverInstance.args[0]) != 3 {
		t.Fatalf("expected cutoff, batch size, and rollup-window parameters; args=%v", driverInstance.args)
	}
	if got, ok := driverInstance.args[0][2].Value.(string); !ok || got != "2026-09-28" {
		t.Fatalf("rollup window start = %#v, want 2026-09-28", driverInstance.args[0][2].Value)
	}
}
