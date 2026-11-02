package analyticsingest

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
)

type fakeResult int64

func (f fakeResult) LastInsertId() (int64, error) { return 0, errors.New("not supported") }
func (f fakeResult) RowsAffected() (int64, error) { return int64(f), nil }

type fakeExecer struct {
	query string
	args  []any
	rows  int64
	err   error
}

func (f *fakeExecer) ExecContext(_ context.Context, query string, args ...any) (sql.Result, error) {
	f.query, f.args = query, args
	if f.err != nil {
		return nil, f.err
	}
	return fakeResult(f.rows), nil
}

func TestValidateAcceptsSupportedAnalyticsEvents(t *testing.T) {
	request := Request{Events: []Event{{EventID: "event-1", Event: "PAGE_VIEW", SessionID: "session-1"}}}
	if err := Validate(request); err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
}

func TestValidateRejectsUnsupportedOrUnboundedEvents(t *testing.T) {
	cases := []struct {
		name  string
		event Event
	}{
		{name: "missing id", event: Event{Event: "PAGE_VIEW", SessionID: "s"}},
		{name: "unsupported event", event: Event{EventID: "e", Event: "ADMIN_DELETE", SessionID: "s"}},
		{name: "missing session", event: Event{EventID: "e", Event: "PAGE_VIEW"}},
		{name: "long session", event: Event{EventID: "e", Event: "PAGE_VIEW", SessionID: strings.Repeat("s", MaxSessionIDLength+1)}},
		{name: "null byte event ID", event: Event{EventID: "e\x00bad", Event: "PAGE_VIEW", SessionID: "s"}},
		{name: "non-object metadata", event: Event{EventID: "e", Event: "PAGE_VIEW", SessionID: "s", Metadata: []byte(`[]`)}},
		{name: "oversized metadata", event: Event{EventID: "e", Event: "PAGE_VIEW", SessionID: "s", Metadata: []byte(`{"payload":"` + strings.Repeat("x", MaxMetadataBytes) + `"}`)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := Validate(Request{Events: []Event{tc.event}}); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestValidateRejectsDuplicateIDsInBatch(t *testing.T) {
	request := Request{Events: []Event{
		{EventID: "same", Event: "PAGE_VIEW", SessionID: "s1"},
		{EventID: "same", Event: "AD_VIEW", SessionID: "s2"},
	}}
	if err := Validate(request); err == nil {
		t.Fatal("expected duplicate event ID to be rejected")
	}
}

func TestInsertUsesPrimaryKeyAsIdempotencyAndSkipsDuplicates(t *testing.T) {
	db := &fakeExecer{rows: 1}
	result, err := Insert(context.Background(), db, Request{Events: []Event{{
		EventID: "event-1", Event: "PAGE_VIEW", SessionID: "session-1",
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 1 || result.Inserted != 1 || result.Duplicates != 0 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if !strings.Contains(db.query, `ON CONFLICT ("id") DO NOTHING`) {
		t.Fatal("insert must use analytics_events primary key for idempotency")
	}
	if len(db.args) != 1 {
		t.Fatalf("expected one JSON batch argument, got %d", len(db.args))
	}
}

func TestInsertReportsAlreadyCommittedEventsAsDuplicates(t *testing.T) {
	db := &fakeExecer{rows: 0}
	result, err := Insert(context.Background(), db, Request{Events: []Event{{
		EventID: "event-1", Event: "PAGE_VIEW", SessionID: "session-1",
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 1 || result.Inserted != 0 || result.Duplicates != 1 {
		t.Fatalf("unexpected duplicate result: %+v", result)
	}
}
