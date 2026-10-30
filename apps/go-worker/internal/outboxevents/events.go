package outboxevents

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"marketplat/apps/go-worker/internal/rediswire"
)

var ErrEventNotOwned = errors.New("outbox event is not owned by this worker")
var ErrEventAlreadyProcessing = errors.New("outbox event is already being processed")
var ErrUnsupportedEvent = errors.New("unsupported outbox event type")

const (
	UserActivityEvent        = "USER_ACTIVITY_RECORD"
	FollowedActivityEvent    = "FOLLOWED_ACTIVITY_NOTIFICATION"
	SavedSearchMatchEvent    = "SAVED_SEARCH_MATCH_NOTIFICATION"
	CacheGenerationBumpEvent = "CACHE_GENERATION_BUMP"
)

type Request struct {
	EventID  string `json:"eventId"`
	WorkerID string `json:"workerId"`
}

type Notification struct {
	ID     string          `json:"id"`
	UserID string          `json:"userId"`
	Type   string          `json:"type"`
	Title  string          `json:"title"`
	Body   string          `json:"body"`
	Data   json.RawMessage `json:"data"`
}

type Result struct {
	EventID   string         `json:"eventId"`
	EventType string         `json:"eventType"`
	Processed bool           `json:"processed"`
	Created   []Notification `json:"created"`
}

type eventRow struct {
	ID             string
	EventType      string
	AggregateID    string
	IdempotencyKey string
	Payload        []byte
}

type activityPayload struct {
	UserID      string          `json:"userId"`
	Type        string          `json:"type"`
	Title       string          `json:"title"`
	Description *string         `json:"description"`
	EntityType  *string         `json:"entityType"`
	EntityID    *string         `json:"entityId"`
	Metadata    json.RawMessage `json:"metadata"`
}

type savedSearchPayload struct {
	AdID    string `json:"adId"`
	AdTitle string `json:"adTitle"`
	Matches []struct {
		UserID        string `json:"userId"`
		SavedSearchID string `json:"savedSearchId"`
		Label         string `json:"label"`
	} `json:"matches"`
}

type followedPayload struct {
	Targets []struct {
		TargetType string `json:"targetType"`
		TargetID   string `json:"targetId"`
	} `json:"targets"`
	Title string          `json:"title"`
	Body  string          `json:"body"`
	Type  string          `json:"type"`
	Data  json.RawMessage `json:"data"`
}

func Run(ctx context.Context, db *sql.DB, request Request) (Result, error) {
	return run(ctx, db, request, nil)
}

func RunWithCacheRedis(ctx context.Context, db *sql.DB, request Request, cacheConfig *rediswire.Config) (Result, error) {
	return run(ctx, db, request, cacheConfig)
}

func run(ctx context.Context, db *sql.DB, request Request, cacheConfig *rediswire.Config) (Result, error) {
	if strings.TrimSpace(request.EventID) == "" || len(request.EventID) > 128 ||
		strings.TrimSpace(request.WorkerID) == "" || len(request.WorkerID) > 120 {
		return Result{}, errors.New("eventId and workerId are required")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, fmt.Errorf("begin outbox event transaction: %w", err)
	}
	defer tx.Rollback()

	// One transaction-scoped lock per event prevents a timed-out HTTP request,
	// duplicate delivery, and Express fallback from processing the same event
	// concurrently. The same key is acquired by the Express fallback.
	var locked bool
	if err := tx.QueryRowContext(ctx, `
		SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))
	`, "marketplat-outbox:"+request.EventID).Scan(&locked); err != nil {
		return Result{}, fmt.Errorf("acquire outbox execution lock: %w", err)
	}
	if !locked {
		return Result{}, ErrEventAlreadyProcessing
	}

	var event eventRow
	err = tx.QueryRowContext(ctx, `
		SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload"
		FROM "outbox_events"
		WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
	`, request.EventID, request.WorkerID).Scan(
		&event.ID, &event.EventType, &event.AggregateID, &event.IdempotencyKey, &event.Payload,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Result{}, ErrEventNotOwned
	}
	if err != nil {
		return Result{}, fmt.Errorf("load claimed outbox event: %w", err)
	}

	result := Result{EventID: event.ID, EventType: event.EventType, Processed: true, Created: []Notification{}}
	switch event.EventType {
	case UserActivityEvent:
		err = processUserActivity(ctx, tx, event)
	case SavedSearchMatchEvent:
		result.Created, err = processSavedSearchMatch(ctx, tx, event)
	case FollowedActivityEvent:
		result.Created, err = processFollowedActivity(ctx, tx, event)
	case CacheGenerationBumpEvent:
		err = processCacheGenerationBump(ctx, tx, event, cacheConfig)
	default:
		return Result{}, fmt.Errorf("%w: %s", ErrUnsupportedEvent, event.EventType)
	}
	if err != nil {
		return Result{}, err
	}

	ack, err := tx.ExecContext(ctx, `
		UPDATE "outbox_events"
		SET "processedAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = NULL
		WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL
	`, event.ID, request.WorkerID)
	if err != nil {
		return Result{}, fmt.Errorf("acknowledge outbox event: %w", err)
	}
	changed, err := ack.RowsAffected()
	if err != nil {
		return Result{}, err
	}
	if changed != 1 {
		return Result{}, ErrEventNotOwned
	}
	if err := tx.Commit(); err != nil {
		return Result{}, fmt.Errorf("commit outbox event: %w", err)
	}
	return result, nil
}

func processUserActivity(ctx context.Context, tx *sql.Tx, event eventRow) error {
	var payload activityPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("decode user activity payload: %w", err)
	}
	if payload.UserID == "" || payload.Title == "" || !oneOf(payload.Type,
		"AD_CREATED", "AD_UPDATED", "AD_DELETED", "PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_DELETED",
		"SERVICE_CREATED", "SERVICE_UPDATED", "SERVICE_DELETED", "STORE_CREATED", "STORE_UPDATED",
		"FAVORITE_ADDED", "FAVORITE_REMOVED", "STORE_FOLLOWED", "STORE_UNFOLLOWED", "MESSAGE_SENT",
		"SERVICE_REQUEST_CREATED", "SERVICE_REQUEST_STATUS_CHANGED", "APPOINTMENT_BOOKED", "APPOINTMENT_CANCELLED",
		"PROFILE_UPDATED", "PASSWORD_CHANGED") {
		return errors.New("user activity payload is invalid")
	}
	if payload.EntityType != nil && !oneOf(*payload.EntityType, "AD", "PRODUCT", "SERVICE_LISTING", "STORE", "CONVERSATION", "SERVICE_REQUEST", "APPOINTMENT") {
		return errors.New("user activity entityType is invalid")
	}
	if len(payload.Metadata) > 0 && !json.Valid(payload.Metadata) {
		return errors.New("user activity metadata is invalid JSON")
	}
	id, err := newID()
	if err != nil {
		return err
	}
	var description, entityType, entityID any
	if payload.Description != nil {
		description = *payload.Description
	}
	if payload.EntityType != nil {
		entityType = *payload.EntityType
	}
	if payload.EntityID != nil {
		entityID = *payload.EntityID
	}
	var metadata any
	if len(payload.Metadata) > 0 {
		metadata = string(payload.Metadata)
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "user_activities"
			("id", "userId", "type", "title", "description", "entityType", "entityId", "metadata", "idempotencyKey", "createdAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())
		ON CONFLICT ("idempotencyKey") DO NOTHING
	`, id, payload.UserID, payload.Type, payload.Title, description, entityType, entityID, metadata,
		"outbox:"+event.IdempotencyKey)
	if err != nil {
		return fmt.Errorf("insert user activity: %w", err)
	}
	return nil
}

func processSavedSearchMatch(ctx context.Context, tx *sql.Tx, event eventRow) ([]Notification, error) {
	var payload savedSearchPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return nil, fmt.Errorf("decode saved-search payload: %w", err)
	}
	if payload.AdID == "" || payload.AdTitle == "" || len(payload.AdTitle) > 2000 || len(payload.Matches) > 5000 {
		return nil, errors.New("saved-search payload is invalid")
	}
	seen := make(map[string]struct{}, len(payload.Matches))
	uniqueMatches := make([]struct {
		UserID        string `json:"userId"`
		SavedSearchID string `json:"savedSearchId"`
		Label         string `json:"label"`
	}, 0, len(payload.Matches))
	for _, match := range payload.Matches {
		if match.UserID == "" || match.SavedSearchID == "" {
			return nil, errors.New("saved-search match is missing userId or savedSearchId")
		}
		key := match.UserID + "\x00" + match.SavedSearchID
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		uniqueMatches = append(uniqueMatches, match)
	}
	encoded, err := json.Marshal(uniqueMatches)
	if err != nil {
		return nil, err
	}

	rows, err := tx.QueryContext(ctx, `
		WITH matches AS (
			SELECT DISTINCT m."userId", m."savedSearchId", m."label"
			FROM jsonb_to_recordset($1::jsonb) AS m("userId" text, "savedSearchId" text, "label" text)
		), eligible AS (
			SELECT m."userId", m."savedSearchId", m."label"
			FROM matches m INNER JOIN "users" u ON u."id" = m."userId"
			WHERE m."userId" <> $2
			  AND COALESCE((u."notificationPreferences" ->> 'savedSearch')::boolean, TRUE) = TRUE
		), inserted AS (
			INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
			SELECT 'go_' || md5(random()::text || clock_timestamp()::text || e."userId" || e."savedSearchId"),
				'outbox:' || $3 || ':saved-search:' || e."savedSearchId" || ':recipient:' || e."userId",
				e."userId", 'SAVED_SEARCH_MATCH', 'إعلان جديد يطابق بحثك المحفوظ',
				'"' || $4 || '" يطابق بحثك المحفوظ "' || COALESCE(e."label", '') || '"',
				jsonb_build_object('adId', $2, 'savedSearchId', e."savedSearchId"), NOW()
			FROM eligible e
			ON CONFLICT ("idempotencyKey") DO NOTHING
			RETURNING "id", "userId", "type", "title", "body", "data"
		), dispatch AS (
			INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
			SELECT 'go_' || md5(random()::text || clock_timestamp()::text || i."id"), i."id", i."userId",
				jsonb_build_object('title', i."title", 'body', i."body", 'url', '/ads/' || $2,
					'tag', 'saved-search-' || (i."data" ->> 'savedSearchId'), 'type', i."type"),
				'notification-push:' || i."id"
			FROM inserted i
			ON CONFLICT ("idempotencyKey") DO NOTHING
			RETURNING "id"
		)
		SELECT i."id", i."userId", i."type", i."title", i."body", i."data" FROM inserted i
	`, string(encoded), payload.AdID, event.ID, payload.AdTitle)
	if err != nil {
		return nil, fmt.Errorf("insert saved-search notifications: %w", err)
	}
	created, err := scanNotifications(rows)
	if err != nil {
		return nil, err
	}

	searchIDs := make([]string, 0, len(uniqueMatches))
	for _, match := range uniqueMatches {
		searchIDs = append(searchIDs, match.SavedSearchID)
	}
	if len(searchIDs) > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE "saved_searches" SET "lastNotifiedAt" = NOW() WHERE "id" = ANY($1::text[])`, searchIDs); err != nil {
			return nil, fmt.Errorf("update saved-search notification timestamps: %w", err)
		}
	}
	return created, nil
}

func processFollowedActivity(ctx context.Context, tx *sql.Tx, event eventRow) ([]Notification, error) {
	var payload followedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return nil, fmt.Errorf("decode followed-activity payload: %w", err)
	}
	if len(payload.Targets) == 0 || len(payload.Targets) > 10 || payload.Title == "" || payload.Body == "" || len(payload.Body) > 500 ||
		!oneOf(payload.Type, "FOLLOWED_USER_ACTIVITY", "FOLLOWED_STORE_ACTIVITY", "FOLLOWED_CATEGORY_ACTIVITY") ||
		len(payload.Data) == 0 || !json.Valid(payload.Data) {
		return nil, errors.New("followed-activity payload is invalid")
	}
	for _, target := range payload.Targets {
		if !oneOf(target.TargetType, "USER", "STORE", "CATEGORY") || target.TargetID == "" {
			return nil, errors.New("followed-activity target is invalid")
		}
	}
	encoded, err := json.Marshal(payload.Targets)
	if err != nil {
		return nil, err
	}

	rows, err := tx.QueryContext(ctx, `
		WITH targets AS (
			SELECT DISTINCT t."targetType", t."targetId"
			FROM jsonb_to_recordset($1::jsonb) AS t("targetType" text, "targetId" text)
		), recipients AS (
			SELECT DISTINCT f."followerId" AS "userId"
			FROM "follows" f INNER JOIN targets t
				ON f."targetType"::text = t."targetType" AND f."targetId" = t."targetId"
			INNER JOIN "users" u ON u."id" = f."followerId"
			WHERE COALESCE((u."notificationPreferences" ->> 'followUpdates')::boolean, TRUE) = TRUE
		), inserted AS (
			INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
			SELECT 'go_' || md5(random()::text || clock_timestamp()::text || r."userId"),
				'outbox:' || $2 || ':recipient:' || r."userId", r."userId", $3, $4, $5, $6::jsonb, NOW()
			FROM recipients r
			ON CONFLICT ("idempotencyKey") DO NOTHING
			RETURNING "id", "userId", "type", "title", "body", "data"
		), dispatch AS (
			INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
			SELECT 'go_' || md5(random()::text || clock_timestamp()::text || i."id"), i."id", i."userId",
				jsonb_build_object('title', i."title", 'body', i."body", 'url', '/?feed=following',
					'tag', 'followed-activity-' || $7, 'type', i."type"),
				'notification-push:' || i."id"
			FROM inserted i
			ON CONFLICT ("idempotencyKey") DO NOTHING
			RETURNING "id"
		)
		SELECT i."id", i."userId", i."type", i."title", i."body", i."data" FROM inserted i
	`, string(encoded), event.ID, payload.Type, payload.Title, payload.Body, string(payload.Data), event.AggregateID)
	if err != nil {
		return nil, fmt.Errorf("insert followed-activity notifications: %w", err)
	}
	created, err := scanNotifications(rows)
	if err != nil {
		return nil, err
	}
	return created, nil
}

func scanNotifications(rows *sql.Rows) ([]Notification, error) {
	defer rows.Close()
	created := make([]Notification, 0)
	for rows.Next() {
		var item Notification
		var data []byte
		if err := rows.Scan(&item.ID, &item.UserID, &item.Type, &item.Title, &item.Body, &data); err != nil {
			return nil, err
		}
		if len(data) > 0 {
			item.Data = append(json.RawMessage(nil), data...)
		}
		created = append(created, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return created, nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func newID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return "go_" + hex.EncodeToString(bytes), nil
}

type cacheGenerationPayload struct {
	GenKey                string   `json:"genKey"`
	RetryRequiredGenKeys  []string `json:"retryRequiredGenKeys"`
	RetryDependentGenKeys []string `json:"retryDependentGenKeys"`
}

func processCacheGenerationBump(ctx context.Context, tx *sql.Tx, event eventRow, config *rediswire.Config) error {
	if config == nil {
		return errors.New("cache Redis is not configured")
	}
	var payload cacheGenerationPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("decode cache-generation payload: %w", err)
	}
	if !validGenerationKey(payload.GenKey) || len(payload.RetryRequiredGenKeys) > 10 || len(payload.RetryDependentGenKeys) > 10 {
		return errors.New("cache-generation payload is invalid")
	}
	keys := []string{payload.GenKey}
	seen := map[string]struct{}{payload.GenKey: {}}
	for _, group := range [][]string{payload.RetryRequiredGenKeys, payload.RetryDependentGenKeys} {
		for _, key := range group {
			if !validGenerationKey(key) {
				return errors.New("cache-generation key is invalid")
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}
	args := make([]string, 1, 1+len(keys)*2)
	args[0] = "MSET"
	for _, key := range keys {
		var token [16]byte
		if _, err := rand.Read(token[:]); err != nil {
			return fmt.Errorf("generate cache token: %w", err)
		}
		args = append(args, key, hex.EncodeToString(token[:]))
	}
	redis, err := rediswire.Dial(ctx, config)
	if err != nil {
		return fmt.Errorf("connect cache Redis: %w", err)
	}
	defer redis.Close()
	if _, err := redis.Do(ctx, args...); err != nil {
		return fmt.Errorf("bump cache generations: %w", err)
	}
	return nil
}

func validGenerationKey(key string) bool {
	return key != "" && len(key) <= 512 && !strings.ContainsAny(key, "\r\n")
}
