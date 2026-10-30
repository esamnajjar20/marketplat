package storycleanup

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var cleanupDriverSequence atomic.Int64

type cleanupScript struct {
	batches    [][][3]driver.Value
	queries    []string
	deleted    []string
	failDelete bool
}
type cleanupDriver struct{ script *cleanupScript }
type cleanupConn struct{ script *cleanupScript }
type cleanupRows struct {
	values [][3]driver.Value
	index  int
}
type cleanupResult int64

func (d *cleanupDriver) Open(string) (driver.Conn, error)  { return &cleanupConn{script: d.script}, nil }
func (c *cleanupConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *cleanupConn) Close() error                        { return nil }
func (c *cleanupConn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }
func (c *cleanupConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.script.queries = append(c.script.queries, query)
	if len(c.script.batches) == 0 {
		return nil, errors.New("unexpected query")
	}
	values := c.script.batches[0]
	c.script.batches = c.script.batches[1:]
	return &cleanupRows{values: values}, nil
}
func (c *cleanupConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if c.script.failDelete {
		return nil, errors.New("database delete failed")
	}
	c.script.deleted = append(c.script.deleted, args[0].Value.(string))
	return cleanupResult(1), nil
}
func (r *cleanupRows) Columns() []string { return []string{"id", "media_public_id", "expires_at"} }
func (r *cleanupRows) Close() error      { return nil }
func (r *cleanupRows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	copy(dest, r.values[r.index][:])
	r.index++
	return nil
}
func (r cleanupResult) LastInsertId() (int64, error) { return 0, nil }
func (r cleanupResult) RowsAffected() (int64, error) { return int64(r), nil }

type fakeMedia struct {
	mu     sync.Mutex
	failed map[string]bool
	calls  []string
}

func (m *fakeMedia) Delete(_ context.Context, publicID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, publicID)
	if m.failed[publicID] {
		return errors.New("Cloudinary unavailable")
	}
	return nil
}

func openCleanupDB(t *testing.T, batches [][][3]driver.Value, failDelete bool) (*sql.DB, *cleanupScript) {
	t.Helper()
	script := &cleanupScript{batches: batches, failDelete: failDelete}
	name := "story-cleanup-" + strconv.FormatInt(cleanupDriverSequence.Add(1), 10)
	sql.Register(name, &cleanupDriver{script: script})
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, script
}

func TestRunKeepsStoryWhenCloudinaryFailsAndDeletesAfterSuccess(t *testing.T) {
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	db, script := openCleanupDB(t, [][][3]driver.Value{
		{{"story-1", "cloud-1", now.Add(-time.Hour)}, {"story-2", "cloud-2", now.Add(-2 * time.Hour)}, {"story-3", nil, now.Add(-3 * time.Hour)}},
	}, false)
	media := &fakeMedia{failed: map[string]bool{"cloud-2": true}}
	result, err := Run(context.Background(), db, media, 10, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Scanned != 3 || result.Deleted != 2 || result.MediaDeleteFailed != 1 || result.RowDeleteFailed != 0 {
		t.Fatalf("unexpected cleanup result: %+v", result)
	}
	if len(script.deleted) != 2 {
		t.Fatalf("deleted rows=%v; want 2", script.deleted)
	}
	if len(script.queries) != 1 || script.queries[0] != firstBatchSQL {
		t.Fatalf("unexpected candidate query: %#v", script.queries)
	}
	if len(media.calls) != 2 {
		t.Fatalf("media deletes=%v; empty public ID should not call Cloudinary", media.calls)
	}
}

func TestRunLeavesRowWhenDatabaseDeleteFailsAfterCloudinarySuccess(t *testing.T) {
	now := time.Now().UTC()
	db, _ := openCleanupDB(t, [][][3]driver.Value{{{"story", "cloud", now.Add(-time.Hour)}}}, true)
	media := &fakeMedia{failed: map[string]bool{}}
	result, err := Run(context.Background(), db, media, 10, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Deleted != 0 || result.RowDeleteFailed != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
}
