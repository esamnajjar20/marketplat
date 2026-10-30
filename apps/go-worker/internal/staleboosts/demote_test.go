package staleboosts

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

type script struct {
	responses [][]driver.Value
	queries   []string
	args      [][]driver.NamedValue
}
type conn struct{ s *script }
type rows struct {
	values []driver.Value
	i      int
}

func (s *script) Open(string) (driver.Conn, error)  { return &conn{s: s}, nil }
func (c *conn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *conn) Close() error                        { return nil }
func (c *conn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }
func (c *conn) QueryContext(_ context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	c.s.queries = append(c.s.queries, q)
	c.s.args = append(c.s.args, append([]driver.NamedValue(nil), args...))
	if len(c.s.responses) == 0 {
		return nil, errors.New("unexpected query")
	}
	v := c.s.responses[0]
	c.s.responses = c.s.responses[1:]
	return &rows{values: v}, nil
}
func (r *rows) Columns() []string { return []string{"value"} }
func (r *rows) Close() error      { return nil }
func (r *rows) Next(dest []driver.Value) error {
	if r.i >= len(r.values) {
		return io.EOF
	}
	dest[0] = r.values[r.i]
	r.i++
	return nil
}
func openDB(t *testing.T, responses [][]driver.Value) (*sql.DB, *script) {
	t.Helper()
	s := &script{responses: responses}
	name := "stale-boosts-" + strconv.FormatInt(driverSequence.Add(1), 10)
	sql.Register(name, s)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, s
}

func TestRunDryRunCountsWithoutMutating(t *testing.T) {
	db, s := openDB(t, [][]driver.Value{{int64(12)}})
	result, err := Run(context.Background(), db, 60, 100, true, time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if result.Candidates != 12 || result.Updated != 0 || result.Batches != 0 || !result.DryRun {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(s.queries) != 1 || !strings.Contains(s.queries[0], `COUNT(*)`) {
		t.Fatalf("dry run must issue only count query: %#v", s.queries)
	}
}

func TestRunDemotesOnlyStaleActiveBoostedAdsInBatches(t *testing.T) {
	db, s := openDB(t, [][]driver.Value{{int64(3)}, {"a1", "a2"}, {"a3"}})
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	result, err := Run(context.Background(), db, 60, 2, false, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Candidates != 3 || result.Updated != 3 || result.Batches != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(s.queries) != 3 {
		t.Fatalf("got %d queries, want count + 2 batches", len(s.queries))
	}
	q := s.queries[1]
	for _, required := range []string{`FROM "ads"`, `"status" = 'ACTIVE'`, `"updatedAt" < $1`, `"isFeatured" = TRUE OR "isPinned" = TRUE`, `ORDER BY "updatedAt" ASC, id ASC`, `LIMIT $3`, `FOR UPDATE SKIP LOCKED`, `SET "isFeatured" = FALSE`, `"isPinned" = FALSE`, `"updatedAt" = $2`} {
		if !strings.Contains(q, required) {
			t.Fatalf("update query missing %q: %s", required, q)
		}
	}
	if s.args[1][2].Value != int64(2) {
		t.Fatalf("batch size = %#v", s.args[1][2].Value)
	}
}

func TestRunRejectsInvalidLimitsBeforeQuery(t *testing.T) {
	for _, tc := range []struct{ days, batch int }{{0, 1}, {MaxStaleDays + 1, 1}, {1, 0}, {1, MaxBatchSize + 1}} {
		if _, err := Run(context.Background(), nil, tc.days, tc.batch, false, time.Now()); err == nil {
			t.Fatalf("expected invalid input error for %+v", tc)
		}
	}
}
