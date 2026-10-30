package viewsbuffer

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"marketplat/apps/go-worker/internal/rediswire"
)

const (
	Prefix           = "views_buffer:"
	MaxKeysPerBatch  = 100
	RetentionSeconds = 24 * 60 * 60
)

const restoreScript = `local count = redis.call('INCRBY', KEYS[1], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[2]); return count`

type Result struct {
	KeysScanned  int64 `json:"keysScanned"`
	AdsUpdated   int64 `json:"adsUpdated"`
	ViewsApplied int64 `json:"viewsApplied"`
	KeysRestored int64 `json:"keysRestored"`
}

type increment struct {
	AdID  string `json:"adId"`
	Count int64  `json:"count"`
}

func Flush(ctx context.Context, db interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, redis *rediswire.Conn) (Result, error) {
	result := Result{}
	cursor := "0"
	for {
		response, err := redis.Do(ctx, "SCAN", cursor, "MATCH", Prefix+"*", "COUNT", strconv.Itoa(MaxKeysPerBatch))
		if err != nil {
			return result, fmt.Errorf("scan view buffer: %w", err)
		}
		nextCursor, keys, err := parseScan(response)
		if err != nil {
			return result, err
		}
		cursor = nextCursor
		if len(keys) > 0 {
			increments := make([]increment, 0, len(keys))
			for _, key := range keys {
				if !strings.HasPrefix(key, Prefix) || len(key) <= len(Prefix) {
					continue
				}
				value, err := redis.Do(ctx, "GETDEL", key)
				if err != nil {
					return result, fmt.Errorf("drain view counter: %w", err)
				}
				if value == nil {
					continue // Key may have changed between SCAN and GETDEL.
				}
				countText, ok := value.(string)
				if !ok {
					return result, errors.New("Redis GETDEL returned an unexpected value")
				}
				count, err := strconv.ParseInt(countText, 10, 64)
				if err != nil || count <= 0 {
					continue
				}
				increments = append(increments, increment{AdID: strings.TrimPrefix(key, Prefix), Count: count})
			}
			if len(increments) > 0 {
				encoded, err := json.Marshal(increments)
				if err != nil {
					return result, err
				}
				res, err := db.ExecContext(ctx, `
					WITH increments AS (
						SELECT * FROM jsonb_to_recordset($1::jsonb) AS x("adId" text, "count" bigint)
					)
					UPDATE "ads" AS ad
					SET "views" = ad."views" + increments."count"
					FROM increments
					WHERE ad."id" = increments."adId" AND ad."status" <> 'DELETED'
				`, string(encoded))
				if err != nil {
					restoreErr := restore(ctx, redis, increments)
					if restoreErr != nil {
						return result, fmt.Errorf("apply view increments failed (%v) and restore failed: %w", err, restoreErr)
					}
					result.KeysRestored += int64(len(increments))
					return result, fmt.Errorf("apply view increments: %w", err)
				}
				updated, err := res.RowsAffected()
				if err != nil {
					return result, fmt.Errorf("read view update count: %w", err)
				}
				result.AdsUpdated += updated
				for _, item := range increments {
					result.ViewsApplied += item.Count
				}
			}
			result.KeysScanned += int64(len(keys))
		}
		if cursor == "0" {
			break
		}
	}
	return result, nil
}

func restore(ctx context.Context, redis *rediswire.Conn, increments []increment) error {
	for _, item := range increments {
		if _, err := redis.Do(ctx, "EVAL", restoreScript, "1", Prefix+item.AdID,
			strconv.FormatInt(item.Count, 10), strconv.Itoa(RetentionSeconds)); err != nil {
			return err
		}
	}
	return nil
}

func parseScan(value any) (string, []string, error) {
	parts, ok := value.([]any)
	if !ok || len(parts) != 2 {
		return "0", nil, errors.New("Redis SCAN returned an unexpected response")
	}
	cursor, ok := parts[0].(string)
	if !ok {
		return "0", nil, errors.New("Redis SCAN cursor is invalid")
	}
	values, ok := parts[1].([]any)
	if !ok {
		return "0", nil, errors.New("Redis SCAN keys are invalid")
	}
	keys := make([]string, 0, len(values))
	for _, value := range values {
		key, ok := value.(string)
		if !ok {
			return "0", nil, errors.New("Redis SCAN returned a non-string key")
		}
		keys = append(keys, key)
	}
	return cursor, keys, nil
}

func RestoreScriptForTest() string { return restoreScript }
