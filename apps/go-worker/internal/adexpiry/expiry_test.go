package adexpiry

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

var driverSequence atomic.Int64

type queryScript struct {
	batches [][][2]driver.Value
	queries []string
	args    [][]driver.NamedValue
}
type queryConn struct{ script *queryScript }
type queryRows struct {
	values [][2]driver.Value
	index  int
}

func (s *queryScript) Open(string) (driver.Conn, error)  { return &queryConn{script: s}, nil }
func (c *queryConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *queryConn) Close() error                        { return nil }
func (c *queryConn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }
func (c *queryConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.script.queries = append(c.script.queries, query)
	c.script.args = append(c.script.args, append([]driver.NamedValue(nil), args...))
	if len(c.script.batches) == 0 {
		return nil, errors.New("unexpected query")
	}
	batch := c.script.batches[0]
	c.script.batches = c.script.batches[1:]
	return &queryRows{values: batch}, nil
}
func (r *queryRows) Columns() []string { return []string{"ad_id", "notification_id"} }
func (r *queryRows) Close() error      { return nil }
func (r *queryRows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	dest[0] = r.values[r.index][0]
	dest[1] = r.values[r.index][1]
	r.index++
	return nil
}

func openTestDB(t *testing.T, batches [][][2]driver.Value) (*sql.DB, *queryScript) {
	t.Helper()
	script := &queryScript{batches: batches}
	name := "ad-expiry-" + strconv.FormatInt(driverSequence.Add(1), 10)
	sql.Register(name, script)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunProcessesWarningsAndExpiryWithDurableNotifications(t *testing.T) {
	db, script := openTestDB(t, [][][2]driver.Value{
		{{"ad-warning", "notification-warning"}},
		{{"ad-expired", "notification-expired"}, {"ad-expired-no-push", nil}},
	})
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.FixedZone("test", 2*60*60))
	result, err := Run(context.Background(), db, 500, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Warned != 1 || result.Expired != 2 || result.Notified != 2 || result.WarningBatches != 1 || result.ExpiryBatches != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(result.NotificationIDs) != 2 || result.NotificationIDs[0] != "notification-warning" || result.NotificationIDs[1] != "notification-expired" {
		t.Fatalf("unexpected notification IDs: %#v", result.NotificationIDs)
	}
	if !strings.HasSuffix(result.EvaluatedAt, "Z") || !strings.HasSuffix(result.WarningCutoff, "Z") {
		t.Fatalf("timestamps should be UTC: %+v", result)
	}
	if len(script.queries) != 2 {
		t.Fatalf("got %d SQL statements, want warning and expiry", len(script.queries))
	}
	for _, required := range []string{
		`ad."status" = 'ACTIVE'`,
		`ad."flaggedForReview" = FALSE`,
		`ad."expiresAt" > $1`,
		`ad."expiresAt" <= $2`,
		`ad."expirationNotifiedAt" IS NULL`,
		`SET "expirationNotifiedAt" = $1`,
		`'AD_EXPIRING_SOON'`,
		`'ad-expiring-soon:' || w."id"`,
		`"notification_push_dispatches"`,
	} {
		if !strings.Contains(script.queries[0], required) {
			t.Fatalf("warning query missing %q", required)
		}
	}
	for _, required := range []string{
		`ad."status" = 'ACTIVE'`,
		`ad."expiresAt" IS NOT NULL`,
		`ad."expiresAt" <= $1`,
		`SET "status" = 'EXPIRED'`,
		`'AD_EXPIRED'`,
		`'ad-expired:' || e."id"`,
		`"notification_push_dispatches"`,
	} {
		if !strings.Contains(script.queries[1], required) {
			t.Fatalf("expiry query missing %q", required)
		}
	}
	if strings.Contains(script.queries[1], `"flaggedForReview"`) {
		t.Fatal("terminal expiry must include flagged ads, matching the previous Express job")
	}
	if len(script.args[0]) != 3 || len(script.args[1]) != 2 {
		t.Fatalf("unexpected SQL parameter counts: warning=%d expiry=%d", len(script.args[0]), len(script.args[1]))
	}
}

func TestRunRejectsInvalidBatchSizeBeforeDatabaseAccess(t *testing.T) {
	for _, size := range []int{0, MaxBatchSize + 1} {
		if _, err := Run(context.Background(), nil, size, time.Now()); err == nil {
			t.Fatalf("expected invalid batch size %d to fail", size)
		}
	}
}
