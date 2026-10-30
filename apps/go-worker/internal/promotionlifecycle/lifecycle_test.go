package promotionlifecycle

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
	batches [][][2]driver.Value
	queries []string
	args    [][]driver.NamedValue
}
type scriptedConn struct{ script *scriptedDriver }
type scriptedRows struct {
	values [][2]driver.Value
	index  int
}

func (d *scriptedDriver) Open(string) (driver.Conn, error) { return &scriptedConn{script: d}, nil }
func (c *scriptedConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not implemented")
}
func (c *scriptedConn) Close() error              { return nil }
func (c *scriptedConn) Begin() (driver.Tx, error) { return nil, errors.New("not implemented") }
func (c *scriptedConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.script.queries = append(c.script.queries, query)
	c.script.args = append(c.script.args, append([]driver.NamedValue(nil), args...))
	if len(c.script.batches) == 0 {
		return nil, errors.New("unexpected query")
	}
	batch := c.script.batches[0]
	c.script.batches = c.script.batches[1:]
	return &scriptedRows{values: batch}, nil
}
func (r *scriptedRows) Columns() []string { return []string{"promotion_id", "notification_id"} }
func (r *scriptedRows) Close() error      { return nil }
func (r *scriptedRows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	dest[0], dest[1] = r.values[r.index][0], r.values[r.index][1]
	r.index++
	return nil
}

func openScriptedDB(t *testing.T, batches [][][2]driver.Value) (*sql.DB, *scriptedDriver) {
	t.Helper()
	script := &scriptedDriver{batches: batches}
	name := "promotion-lifecycle-" + strconv.FormatInt(testDriverSequence.Add(1), 10)
	sql.Register(name, script)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunProcessesPromotionTransitionsAndDurableNotifications(t *testing.T) {
	db, script := openScriptedDB(t, [][][2]driver.Value{
		{{"p-started-1", "owner-notification"}, {"p-started-1", "follower-notification"}, {"p-started-2", nil}},
		{}, // Remaining started promotions.
		{{"p-expiring", "warning-notification"}},
		{{"p-expired", nil}},
	})
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.FixedZone("test", 2*60*60))
	result, err := Run(context.Background(), db, 2, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Started != 2 || result.Expiring != 1 || result.Expired != 1 || result.Notified != 3 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.StartedBatches != 1 || result.ExpiringBatches != 1 || result.ExpiredBatches != 1 {
		t.Fatalf("unexpected batch counters: %+v", result)
	}
	if len(result.NotificationIDs) != 3 || result.NotificationIDs[0] != "owner-notification" || result.NotificationIDs[1] != "follower-notification" || result.NotificationIDs[2] != "warning-notification" {
		t.Fatalf("unexpected notification IDs: %#v", result.NotificationIDs)
	}
	if !strings.HasSuffix(result.EvaluatedAt, "Z") || !strings.HasSuffix(result.WarningCutoff, "Z") {
		t.Fatalf("timestamps should be UTC: %+v", result)
	}
	if len(script.queries) != 4 {
		t.Fatalf("got %d SQL statements; want 4", len(script.queries))
	}
	for _, required := range []string{
		`p."status" = 'SCHEDULED'`, `SET "status" = 'ACTIVE'`,
		`'PROMOTION_STATUS_CHANGE'`, `'STORE_PROMOTION_STARTED'`,
		`'promotion-started-owner:'`, `'store-promotion-started:'`,
		`INNER JOIN "store_followers" sf ON sf."storeId" = s."storeId"`,
		`"notification_push_dispatches"`, `ON CONFLICT ("idempotencyKey") DO NOTHING`,
	} {
		if !strings.Contains(script.queries[0], required) {
			t.Fatalf("started query missing %q", required)
		}
	}
	for _, required := range []string{`p."expiryWarnedAt" IS NULL`, `SET "expiryWarnedAt" = $1`, `'expiring'`, `"notification_push_dispatches"`} {
		if !strings.Contains(script.queries[2], required) {
			t.Fatalf("expiring query missing %q", required)
		}
	}
	for _, required := range []string{`p."endsAt" <= $1`, `SET "status" = 'EXPIRED'`, `'expired'`, `"notification_push_dispatches"`} {
		if !strings.Contains(script.queries[3], required) {
			t.Fatalf("expired query missing %q", required)
		}
	}
	if len(script.args[0]) != 2 || len(script.args[2]) != 3 || len(script.args[3]) != 2 {
		t.Fatalf("unexpected SQL argument counts: started=%d expiring=%d expired=%d", len(script.args[0]), len(script.args[2]), len(script.args[3]))
	}
}

func TestRunRejectsInvalidBatchSize(t *testing.T) {
	for _, size := range []int{0, MaxBatchSize + 1} {
		if _, err := Run(context.Background(), nil, size, time.Now()); err == nil {
			t.Fatalf("expected invalid size %d to fail", size)
		}
	}
}
