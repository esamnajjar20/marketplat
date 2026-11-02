package analyticsingest

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

const MaxBatchSize = 20
const MaxSessionIDLength = 100
const MaxEventIDLength = 100
const MaxMetadataBytes = 10_000
const MaxPathLength = 500

var allowedEvents = map[string]struct{}{
	"PAGE_VIEW": {}, "AD_VIEW": {}, "SEARCH": {}, "CATEGORY_BROWSE": {},
	"CONTACT_CLICK": {}, "SIGNUP_STARTED": {}, "SIGNUP_COMPLETED": {},
	"PRODUCT_VIEW": {}, "SERVICE_VIEW": {},
}

type Event struct {
	EventID   string          `json:"eventId"`
	Event     string          `json:"event"`
	SessionID string          `json:"sessionId"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	Path      *string         `json:"path,omitempty"`
	Referrer  *string         `json:"referrer,omitempty"`
}

type Request struct {
	UserID *string `json:"userId"`
	Events []Event `json:"events"`
}

type Result struct {
	Accepted   int64 `json:"accepted"`
	Inserted   int64 `json:"inserted"`
	Duplicates int64 `json:"duplicates"`
}

type Execer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func Validate(request Request) error {
	if len(request.Events) < 1 || len(request.Events) > MaxBatchSize {
		return fmt.Errorf("events must contain between 1 and %d items", MaxBatchSize)
	}
	if request.UserID != nil && (strings.TrimSpace(*request.UserID) == "" || strings.ContainsRune(*request.UserID, '\x00') || utf8.RuneCountInString(*request.UserID) > 128) {
		return errors.New("userId is invalid")
	}
	seen := make(map[string]struct{}, len(request.Events))
	for index, event := range request.Events {
		if strings.TrimSpace(event.EventID) == "" || strings.ContainsRune(event.EventID, '\x00') || utf8.RuneCountInString(event.EventID) > MaxEventIDLength {
			return fmt.Errorf("events[%d].eventId is required and must be at most %d characters", index, MaxEventIDLength)
		}
		if _, ok := allowedEvents[event.Event]; !ok {
			return fmt.Errorf("events[%d].event is unsupported", index)
		}
		if strings.TrimSpace(event.SessionID) == "" || strings.ContainsRune(event.SessionID, '\x00') || utf8.RuneCountInString(event.SessionID) > MaxSessionIDLength {
			return fmt.Errorf("events[%d].sessionId is invalid", index)
		}
		if len(event.Metadata) > 0 {
			trimmed := strings.TrimSpace(string(event.Metadata))
			if len(event.Metadata) > MaxMetadataBytes || len(trimmed) == 0 || trimmed[0] != '{' || !json.Valid(event.Metadata) {
				return fmt.Errorf("events[%d].metadata must be a JSON object no larger than %d bytes", index, MaxMetadataBytes)
			}
		}
		if event.Path != nil && (strings.ContainsRune(*event.Path, '\x00') || utf8.RuneCountInString(*event.Path) > MaxPathLength) {
			return fmt.Errorf("events[%d].path is too long or contains an invalid character", index)
		}
		if event.Referrer != nil && (strings.ContainsRune(*event.Referrer, '\x00') || utf8.RuneCountInString(*event.Referrer) > MaxPathLength) {
			return fmt.Errorf("events[%d].referrer is too long or contains an invalid character", index)
		}
		if _, exists := seen[event.EventID]; exists {
			return fmt.Errorf("events[%d].eventId is duplicated in the request", index)
		}
		seen[event.EventID] = struct{}{}
	}
	return nil
}

func Insert(ctx context.Context, db Execer, request Request) (Result, error) {
	if db == nil {
		return Result{}, errors.New("analytics database executor is required")
	}
	if err := Validate(request); err != nil {
		return Result{}, err
	}

	type row struct {
		ID        string          `json:"id"`
		Event     string          `json:"event"`
		SessionID string          `json:"sessionId"`
		UserID    *string         `json:"userId"`
		Metadata  json.RawMessage `json:"metadata"`
		Path      *string         `json:"path"`
		Referrer  *string         `json:"referrer"`
	}
	rows := make([]row, 0, len(request.Events))
	for _, event := range request.Events {
		rows = append(rows, row{
			ID: event.EventID, Event: event.Event, SessionID: event.SessionID,
			UserID: request.UserID, Metadata: event.Metadata, Path: event.Path, Referrer: event.Referrer,
		})
	}
	payload, err := json.Marshal(rows)
	if err != nil {
		return Result{}, fmt.Errorf("encode analytics batch: %w", err)
	}
	result, err := db.ExecContext(ctx, `
		WITH incoming AS (
			SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
				"id" text, "event" text, "sessionId" text, "userId" text,
				"metadata" jsonb, "path" text, "referrer" text
			)
		)
		INSERT INTO "analytics_events"
			("id", "event", "sessionId", "userId", "metadata", "path", "referrer")
		SELECT "id", "event"::"AnalyticsEventType", "sessionId", "userId", "metadata", "path", "referrer"
		FROM incoming
		ON CONFLICT ("id") DO NOTHING
	`, string(payload))
	if err != nil {
		return Result{}, fmt.Errorf("insert analytics batch: %w", err)
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return Result{}, fmt.Errorf("read inserted analytics count: %w", err)
	}
	accepted := int64(len(request.Events))
	if inserted < 0 || inserted > accepted {
		return Result{}, fmt.Errorf("database returned impossible analytics insert count %d for %d events", inserted, accepted)
	}
	return Result{Accepted: accepted, Inserted: inserted, Duplicates: accepted - inserted}, nil
}
