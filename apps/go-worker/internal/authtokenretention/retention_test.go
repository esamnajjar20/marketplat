package authtokenretention

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
	copiedArgs := append([]driver.NamedValue(nil), args...)
	c.script.args = append(c.script.args, copiedArgs)
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
	name := "marketplat-auth-token-retention-" + strings.ReplaceAll(t.Name(), "/", "-") + "-" + strconv.FormatInt(driverSequence.Add(1), 10)
	script := &scriptedDriver{responses: responses}
	sql.Register(name, script)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open fake database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunDeletesInBoundedBatchesAndPreservesEmailVerificationAuditTokens(t *testing.T) {
	db, script := openScriptedDB(t, [][]string{
		{"password-1", "password-2"}, // full password-reset batch
		{"password-3"},               // final short password-reset batch
		{},                           // no expired email-verification tokens
	})

	now := time.Date(2026, time.October, 30, 8, 0, 0, 0, time.FixedZone("test", 2*60*60))
	result, err := Run(context.Background(), db, 2, now)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Deleted != 3 || result.Batches != 2 {
		t.Fatalf("unexpected totals: deleted=%d batches=%d", result.Deleted, result.Batches)
	}
	if result.PasswordResetDeleted != 3 || result.EmailVerificationDeleted != 0 {
		t.Fatalf("unexpected table totals: %+v", result)
	}
	if len(script.queries) != 3 {
		t.Fatalf("query count = %d, want 3", len(script.queries))
	}

	if !strings.Contains(script.queries[0], `"expiresAt" < $1 OR "used" = TRUE`) {
		t.Fatalf("password reset policy missing from SQL: %s", script.queries[0])
	}
	if !strings.Contains(script.queries[2], `FROM "email_verification_tokens"`) ||
		!strings.Contains(script.queries[2], `WHERE "expiresAt" < $1`) ||
		strings.Contains(script.queries[2], `"used" = TRUE`) {
		t.Fatalf("email verification audit-retention policy is incorrect: %s", script.queries[2])
	}

	wantNow := now.UTC()
	for i, args := range script.args {
		if len(args) != 2 {
			t.Fatalf("query %d args length = %d, want 2", i, len(args))
		}
		gotTime, ok := args[0].Value.(time.Time)
		if !ok || !gotTime.Equal(wantNow) {
			t.Fatalf("query %d cutoff = %#v, want %s", i, args[0].Value, wantNow)
		}
		if args[1].Value != int64(2) {
			t.Fatalf("query %d batch size = %#v, want 2", i, args[1].Value)
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
