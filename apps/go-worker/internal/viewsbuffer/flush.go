package viewsbuffer

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/rediswire"
)

const (
	Prefix           = "views_buffer:"
	PendingKey       = "views_buffer:inflight"
	MaxKeysPerBatch  = 100
	PendingBatchScan = 25
	RetentionSeconds = 24 * 60 * 60
)

// drainScript stages the counter payload in a durable Redis hash BEFORE it
// deletes the counters. Redis executes Lua atomically, so a process crash after
// this script cannot lose a drained batch. New increments arriving after the
// script create fresh counter values for the next flush.
const drainScript = `
local pendingKey = KEYS[#KEYS]
local keyType = redis.call('TYPE', pendingKey)
if type(keyType) == 'table' then keyType = keyType.ok end
if keyType ~= 'none' and keyType ~= 'hash' then
  return redis.error_reply('views inflight key must be a Redis hash')
end
local increments = {}
for i = 1, (#KEYS - 1) do
  local value = redis.call('GET', KEYS[i])
  if value then
    local count = tonumber(value)
    if count and count > 0 then
      table.insert(increments, {
        adId = string.sub(KEYS[i], string.len(ARGV[2]) + 1),
        count = math.floor(count)
      })
    end
  end
end
local encoded = cjson.encode(increments)
if #increments > 0 then
  redis.call('HSET', pendingKey, ARGV[1], encoded)
end
for i = 1, (#KEYS - 1) do
  redis.call('DEL', KEYS[i])
end
return encoded
`

type Result struct {
	KeysScanned    int64 `json:"keysScanned"`
	AdsUpdated     int64 `json:"adsUpdated"`
	ViewsApplied   int64 `json:"viewsApplied"`
	KeysRestored   int64 `json:"keysRestored"`
	BatchesStaged  int64 `json:"batchesStaged"`
	BatchesRetried int64 `json:"batchesRetried"`
}

type increment struct {
	AdID  string `json:"adId"`
	Count int64  `json:"count"`
}

type transactionBeginner interface {
	BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
}

func Flush(ctx context.Context, db transactionBeginner, redis *rediswire.Conn) (Result, error) {
	result := Result{}
	// Recover batches that were durably staged by an earlier process before
	// accepting new counters. Each batch has a database receipt in the same
	// transaction as the ad view updates, making ambiguous commits idempotent.
	if err := processPending(ctx, db, redis, &result); err != nil {
		return result, err
	}

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
		validKeys := make([]string, 0, len(keys))
		for _, key := range keys {
			if strings.HasPrefix(key, Prefix) && len(key) > len(Prefix) && key != PendingKey {
				validKeys = append(validKeys, key)
			}
		}
		if len(validKeys) > 0 {
			batchID, err := newBatchID()
			if err != nil {
				return result, err
			}
			args := make([]string, 0, 4+len(validKeys))
			args = append(args, "EVAL", drainScript, strconv.Itoa(len(validKeys)+1))
			args = append(args, validKeys...)
			args = append(args, PendingKey, batchID, Prefix)
			response, err := redis.Do(ctx, args...)
			if err != nil {
				return result, fmt.Errorf("stage view buffer batch: %w", err)
			}
			encoded, ok := response.(string)
			if !ok {
				return result, errors.New("Redis view-buffer staging returned an unexpected response")
			}
			result.KeysScanned += int64(len(validKeys))
			if encoded != "[]" && encoded != "null" {
				result.BatchesStaged++
				if err := applyBatch(ctx, db, redis, batchID, encoded, &result); err != nil {
					return result, err
				}
			}
		}
		if cursor == "0" {
			break
		}
	}

	// A final pass picks up batches staged by this flush even when SCAN found
	// more than one page. It also handles rare HDEL acknowledgement failures.
	if err := processPending(ctx, db, redis, &result); err != nil {
		return result, err
	}
	return result, nil
}

func processPending(ctx context.Context, db transactionBeginner, redis *rediswire.Conn, result *Result) error {
	cursor := "0"
	for {
		response, err := redis.Do(ctx, "HSCAN", PendingKey, cursor, "COUNT", strconv.Itoa(PendingBatchScan))
		if err != nil {
			return fmt.Errorf("scan pending view batches: %w", err)
		}
		nextCursor, entries, err := parseHashScan(response)
		if err != nil {
			return err
		}
		cursor = nextCursor
		for _, item := range entries {
			result.BatchesRetried++
			if err := applyBatch(ctx, db, redis, item.id, item.payload, result); err != nil {
				return err
			}
		}
		if cursor == "0" {
			break
		}
	}
	return nil
}

type pendingBatch struct {
	id      string
	payload string
}

func applyBatch(ctx context.Context, db transactionBeginner, redis *rediswire.Conn, batchID, encoded string, result *Result) error {
	var increments []increment
	if err := json.Unmarshal([]byte(encoded), &increments); err != nil {
		return fmt.Errorf("decode pending view batch %s: %w", batchID, err)
	}
	for _, item := range increments {
		if item.AdID == "" || item.Count <= 0 {
			return fmt.Errorf("pending view batch %s contains an invalid increment", batchID)
		}
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin view batch %s transaction: %w", batchID, err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	inserted, err := tx.ExecContext(ctx, `
		INSERT INTO "view_buffer_flush_batches" ("id", "adCount", "viewsCount")
		VALUES ($1, $2, $3)
		ON CONFLICT ("id") DO NOTHING
	`, batchID, len(increments), totalViews(increments))
	if err != nil {
		return fmt.Errorf("record view batch %s: %w", batchID, err)
	}
	newBatchCount, err := inserted.RowsAffected()
	if err != nil {
		return fmt.Errorf("read view batch receipt result: %w", err)
	}
	if newBatchCount == 1 && len(increments) > 0 {
		payload, err := json.Marshal(increments)
		if err != nil {
			return err
		}
		res, err := tx.ExecContext(ctx, `
			WITH increments AS (
				SELECT * FROM jsonb_to_recordset($1::jsonb) AS x("adId" text, "count" bigint)
			)
			UPDATE "ads" AS ad
			SET "views" = ad."views" + increments."count"
			FROM increments
			WHERE ad."id" = increments."adId" AND ad."status" <> 'DELETED'
		`, string(payload))
		if err != nil {
			return fmt.Errorf("apply view batch %s: %w", batchID, err)
		}
		updated, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("read view update count: %w", err)
		}
		result.AdsUpdated += updated
		result.ViewsApplied += totalViews(increments)
	}
	if err := tx.Commit(); err != nil {
		// Keep the Redis inflight payload. If COMMIT actually succeeded, the
		// unique receipt makes the retry a no-op; if it rolled back, the retry
		// inserts the receipt and applies the counts.
		return fmt.Errorf("commit view batch %s: %w", batchID, err)
	}
	committed = true

	// Acknowledgement is cleanup only: if its response is ambiguous, the
	// receipt still prevents duplicate increments on the next worker pass.
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()
	if _, err := redis.Do(cleanupCtx, "HDEL", PendingKey, batchID); err != nil {
		return fmt.Errorf("acknowledge view batch %s in Redis: %w", batchID, err)
	}
	// Keep the receipt as a durable deduplication tombstone. HSCAN can return
	// duplicate fields while Redis rehashes; retaining the receipt also covers
	// an ambiguous HDEL acknowledgement across process restarts.
	return nil
}

func totalViews(items []increment) int64 {
	var total int64
	for _, item := range items {
		total += item.Count
	}
	return total
}

func newBatchID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate view batch id: %w", err)
	}
	return "go_" + hex.EncodeToString(bytes), nil
}

func parseHashScan(value any) (string, []pendingBatch, error) {
	parts, ok := value.([]any)
	if !ok || len(parts) != 2 {
		return "0", nil, errors.New("Redis HSCAN returned an unexpected response")
	}
	cursor, ok := parts[0].(string)
	if !ok {
		return "0", nil, errors.New("Redis HSCAN cursor is invalid")
	}
	values, ok := parts[1].([]any)
	if !ok || len(values)%2 != 0 {
		return "0", nil, errors.New("Redis HSCAN fields are invalid")
	}
	out := make([]pendingBatch, 0, len(values)/2)
	for i := 0; i < len(values); i += 2 {
		id, idOK := values[i].(string)
		payload, payloadOK := values[i+1].(string)
		if !idOK || !payloadOK {
			return "0", nil, errors.New("Redis HSCAN returned a non-string field")
		}
		out = append(out, pendingBatch{id: id, payload: payload})
	}
	return cursor, out, nil
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

func DrainScriptForTest() string { return drainScript }
