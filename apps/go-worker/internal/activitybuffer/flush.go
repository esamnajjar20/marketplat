package activitybuffer

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"marketplat/apps/go-worker/internal/rediswire"
)

const (
	RedisKey         = "activity_buffer:pending"
	BatchSize        = 500
	RetentionSeconds = 24 * 60 * 60
)

type Result struct {
	Popped   int   `json:"popped"`
	Inserted int64 `json:"inserted"`
	Invalid  int   `json:"invalid"`
	Requeued int   `json:"requeued"`
}

type entry struct {
	UserID         string          `json:"userId"`
	Type           string          `json:"type"`
	Title          string          `json:"title"`
	Description    *string         `json:"description"`
	EntityType     *string         `json:"entityType"`
	EntityID       *string         `json:"entityId"`
	Metadata       json.RawMessage `json:"metadata"`
	IdempotencyKey string          `json:"idempotencyKey"`
	CreatedAt      time.Time       `json:"createdAt"`
}

var activityTypes = map[string]struct{}{
	"AD_CREATED": {}, "AD_UPDATED": {}, "AD_DELETED": {},
	"PRODUCT_CREATED": {}, "PRODUCT_UPDATED": {}, "PRODUCT_DELETED": {},
	"SERVICE_CREATED": {}, "SERVICE_UPDATED": {}, "SERVICE_DELETED": {},
	"STORE_CREATED": {}, "STORE_UPDATED": {}, "FAVORITE_ADDED": {},
	"FAVORITE_REMOVED": {}, "STORE_FOLLOWED": {}, "STORE_UNFOLLOWED": {},
	"MESSAGE_SENT": {}, "SERVICE_REQUEST_CREATED": {}, "SERVICE_REQUEST_STATUS_CHANGED": {},
	"APPOINTMENT_BOOKED": {}, "APPOINTMENT_CANCELLED": {}, "PROFILE_UPDATED": {}, "PASSWORD_CHANGED": {},
}
var entityTypes = map[string]struct{}{
	"AD": {}, "PRODUCT": {}, "SERVICE_LISTING": {}, "STORE": {},
	"CONVERSATION": {}, "SERVICE_REQUEST": {}, "APPOINTMENT": {},
}

func Flush(ctx context.Context, db interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, redis *rediswire.Conn) (Result, error) {
	response, err := redis.Do(ctx, "LPOP", RedisKey, fmt.Sprint(BatchSize))
	if err != nil {
		return Result{}, fmt.Errorf("pop activity buffer: %w", err)
	}
	raw, err := stringArray(response)
	if err != nil {
		return Result{}, err
	}
	result := Result{Popped: len(raw)}
	if len(raw) == 0 {
		return result, nil
	}

	entries := make([]entry, 0, len(raw))
	validRaw := make([]string, 0, len(raw))
	for _, item := range raw {
		var decoded entry
		if err := json.Unmarshal([]byte(item), &decoded); err != nil || !validEntry(decoded) {
			result.Invalid++
			continue // Preserve the existing buffer contract: poison entries are logged and dropped.
		}
		entries = append(entries, decoded)
		validRaw = append(validRaw, item)
	}
	if len(entries) == 0 {
		return result, nil
	}

	encoded, err := json.Marshal(entries)
	if err != nil {
		return result, err
	}
	res, err := db.ExecContext(ctx, `
		WITH entries AS (
			SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
				"userId" text, "type" text, "title" text, "description" text,
				"entityType" text, "entityId" text, "metadata" jsonb,
				"idempotencyKey" text, "createdAt" timestamptz
			)
		)
		INSERT INTO "user_activities"
			("id", "userId", "type", "title", "description", "entityType", "entityId", "metadata", "idempotencyKey", "createdAt")
		SELECT 'go_' || md5(random()::text || clock_timestamp()::text || e."idempotencyKey"),
			e."userId", e."type"::"UserActivityType", e."title", e."description", e."entityType"::"ActivityEntityType", e."entityId",
			e."metadata", e."idempotencyKey", e."createdAt"
		FROM entries e
		ON CONFLICT ("idempotencyKey") DO NOTHING
	`, string(encoded))
	if err != nil {
		requeueErr := requeue(ctx, redis, validRaw)
		if requeueErr != nil {
			return result, fmt.Errorf("insert activity batch failed (%v) and Redis requeue failed: %w", err, requeueErr)
		}
		result.Requeued = len(validRaw)
		return result, fmt.Errorf("insert activity batch: %w", err)
	}
	result.Inserted, err = res.RowsAffected()
	if err != nil {
		return result, fmt.Errorf("read activity insert count: %w", err)
	}
	return result, nil
}

func validEntry(item entry) bool {
	if item.UserID == "" || item.Title == "" || item.IdempotencyKey == "" || item.CreatedAt.IsZero() {
		return false
	}
	if _, ok := activityTypes[item.Type]; !ok {
		return false
	}
	if item.EntityType != nil {
		if _, ok := entityTypes[*item.EntityType]; !ok {
			return false
		}
	}
	return len(item.Metadata) == 0 || json.Valid(item.Metadata)
}

func requeue(ctx context.Context, redis *rediswire.Conn, raw []string) error {
	if len(raw) == 0 {
		return nil
	}
	args := make([]string, 0, 2+len(raw))
	args = append(args, "LPUSH", RedisKey)
	for i := len(raw) - 1; i >= 0; i-- {
		args = append(args, raw[i])
	}
	if _, err := redis.Do(ctx, args...); err != nil {
		return err
	}
	if _, err := redis.Do(ctx, "EXPIRE", RedisKey, fmt.Sprint(RetentionSeconds)); err != nil {
		return err
	}
	return nil
}

func stringArray(value any) ([]string, error) {
	if value == nil {
		return nil, nil
	}
	items, ok := value.([]any)
	if !ok {
		return nil, errors.New("Redis LPOP returned an unexpected response")
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		value, ok := item.(string)
		if !ok {
			return nil, errors.New("Redis LPOP returned a non-string entry")
		}
		out = append(out, value)
	}
	return out, nil
}
