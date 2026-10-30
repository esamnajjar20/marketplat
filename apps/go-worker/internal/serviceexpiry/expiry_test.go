package serviceexpiry

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
func (r *queryRows) Columns() []string { return []string{"request_id", "notification_id"} }
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
	name := "service-expiry-" + strconv.FormatInt(driverSequence.Add(1), 10)
	sql.Register(name, script)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunExpiresInBoundedBatchesAndReturnsNotificationIDs(t *testing.T) {
	db, script := openTestDB(t, [][][2]driver.Value{
		{{"request-1", "notification-1"}, {"request-2", nil}},
		{{"request-3", "notification-3"}},
	})
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.FixedZone("test", 2*60*60))
	result, err := Run(context.Background(), db, 7, 2, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Expired != 3 || result.Notified != 2 || result.Batches != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(result.NotificationIDs) != 2 || result.NotificationIDs[0] != "notification-1" || result.NotificationIDs[1] != "notification-3" {
		t.Fatalf("unexpected notification IDs: %#v", result.NotificationIDs)
	}
	if result.TTLDays != 7 || result.LimitReached {
		t.Fatalf("unexpected policy fields: %+v", result)
	}
	if !strings.HasSuffix(result.EvaluatedAt, "Z") || !strings.HasSuffix(result.Cutoff, "Z") {
		t.Fatalf("timestamps should be UTC: %+v", result)
	}
	for i, query := range script.queries {
		for _, required := range []string{
			`FROM "service_requests" AS sr`,
			`sr."status" = 'PENDING'`,
			`sr."createdAt" < $1`,
			`FOR UPDATE OF sr SKIP LOCKED`,
			`SET "status" = 'EXPIRED'`,
			`'service-request-expired:' || e."id"`,
			`'SERVICE_REQUEST_UPDATE'`,
			`"notification_push_dispatches"`,
			`'serviceQuotes'`,
		} {
			if !strings.Contains(query, required) {
				t.Fatalf("query %d missing %q", i, required)
			}
		}
		if len(script.args[i]) != 4 || script.args[i][1].Value != int64(2) || script.args[i][3].Value != int64(7) {
			t.Fatalf("unexpected query args %d: %#v", i, script.args[i])
		}
	}
}

func TestRunRejectsInvalidPolicyBeforeDatabaseAccess(t *testing.T) {
	for _, test := range []struct{ ttl, batch int }{{0, 200}, {MaxTTLDays + 1, 200}, {7, 0}, {7, MaxBatchSize + 1}} {
		if _, err := Run(context.Background(), nil, test.ttl, test.batch, time.Now()); err == nil {
			t.Fatalf("expected invalid parameters to fail: %+v", test)
		}
	}
}

func TestRunMarksBatchLimitWhenFull(t *testing.T) {
	full := make([][2]driver.Value, DefaultBatchSize)
	for i := range full {
		full[i] = [2]driver.Value{"request", nil}
	}
	batches := make([][][2]driver.Value, MaxBatches)
	for i := range batches {
		batches[i] = full
	}
	db, _ := openTestDB(t, batches)
	result, err := Run(context.Background(), db, DefaultTTLDays, DefaultBatchSize, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if result.Expired != int64(MaxBatches*DefaultBatchSize) || !result.LimitReached || result.Batches != MaxBatches {
		t.Fatalf("expected capped run to be flagged, got %+v", result)
	}
}
