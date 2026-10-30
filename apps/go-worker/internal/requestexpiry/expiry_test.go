package requestexpiry

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
	batches [][]string
	queries []string
	args    [][]driver.NamedValue
}
type conn struct{ s *script }
type rows struct {
	ids []string
	i   int
}

func (s *script) Open(string) (driver.Conn, error)  { return &conn{s: s}, nil }
func (c *conn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *conn) Close() error                        { return nil }
func (c *conn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }
func (c *conn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.s.queries = append(c.s.queries, query)
	c.s.args = append(c.s.args, append([]driver.NamedValue(nil), args...))
	if len(c.s.batches) == 0 {
		return nil, errors.New("unexpected query")
	}
	batch := c.s.batches[0]
	c.s.batches = c.s.batches[1:]
	return &rows{ids: batch}, nil
}
func (r *rows) Columns() []string { return []string{"id"} }
func (r *rows) Close() error      { return nil }
func (r *rows) Next(dest []driver.Value) error {
	if r.i >= len(r.ids) {
		return io.EOF
	}
	dest[0] = r.ids[r.i]
	r.i++
	return nil
}
func openDB(t *testing.T, batches [][]string) (*sql.DB, *script) {
	t.Helper()
	s := &script{batches: batches}
	name := "request-expiry-" + strconv.FormatInt(driverSequence.Add(1), 10)
	sql.Register(name, s)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, s
}

func TestRunExpiresRequestsInBoundedBatches(t *testing.T) {
	db, s := openDB(t, [][]string{{"r1", "r2"}, {"r3"}})
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.FixedZone("test", 2*60*60))
	result, err := Run(context.Background(), db, 2, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Expired != 3 || result.Batches != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(s.queries) != 2 {
		t.Fatalf("got %d queries, want 2", len(s.queries))
	}
	for i, q := range s.queries {
		for _, required := range []string{`FROM "requests"`, `"status" = 'OPEN'`, `"expiresAt" IS NOT NULL`, `"expiresAt" <= $1`, `ORDER BY "expiresAt" ASC, id ASC`, `LIMIT $2`, `FOR UPDATE SKIP LOCKED`, `SET "status" = 'EXPIRED'`} {
			if !strings.Contains(q, required) {
				t.Fatalf("query %d missing %q: %s", i, required, q)
			}
		}
		if len(s.args[i]) != 2 {
			t.Fatalf("query %d has %d args", i, len(s.args[i]))
		}
		if s.args[i][1].Value != int64(2) {
			t.Fatalf("batch size = %#v", s.args[i][1].Value)
		}
	}
	if !strings.Contains(result.EvaluatedAt, "Z") {
		t.Fatalf("evaluatedAt should be UTC: %s", result.EvaluatedAt)
	}
}

func TestRunRejectsInvalidBatchSizeBeforeQuery(t *testing.T) {
	for _, size := range []int{0, MaxBatchSize + 1} {
		if _, err := Run(context.Background(), nil, size, time.Now()); err == nil {
			t.Fatalf("expected error for batch size %d", size)
		}
	}
}
