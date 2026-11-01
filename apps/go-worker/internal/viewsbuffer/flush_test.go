package viewsbuffer

import (
	"strings"
	"testing"
)

func TestParseScan(t *testing.T) {
	cursor, keys, err := parseScan([]any{"17", []any{"views_buffer:a", "views_buffer:b"}})
	if err != nil {
		t.Fatal(err)
	}
	if cursor != "17" || len(keys) != 2 || keys[0] != "views_buffer:a" {
		t.Fatalf("unexpected result: %q %#v", cursor, keys)
	}
}

func TestParseScanRejectsMalformedResponse(t *testing.T) {
	if _, _, err := parseScan("bad"); err == nil {
		t.Fatal("expected malformed response error")
	}
}

func TestParseHashScan(t *testing.T) {
	cursor, batches, err := parseHashScan([]any{"0", []any{"batch-1", `[{"adId":"ad-1","count":3}]`, "batch-2", `[{"adId":"ad-2","count":4}]`}})
	if err != nil {
		t.Fatal(err)
	}
	if cursor != "0" || len(batches) != 2 || batches[0].id != "batch-1" || batches[1].payload != `[{"adId":"ad-2","count":4}]` {
		t.Fatalf("unexpected HSCAN parse: cursor=%q batches=%#v", cursor, batches)
	}
}

func TestParseHashScanRejectsOddFieldList(t *testing.T) {
	if _, _, err := parseHashScan([]any{"0", []any{"batch-1"}}); err == nil {
		t.Fatal("expected odd HSCAN field list to fail")
	}
}

func TestDrainScriptStagesPayloadBeforeDeletingCounters(t *testing.T) {
	script := DrainScriptForTest()
	stage := strings.Index(script, `redis.call('HSET', pendingKey`)
	delete := strings.Index(script, `redis.call('DEL', KEYS[i])`)
	if stage < 0 || delete < 0 || stage > delete {
		t.Fatalf("drain script must stage the batch before deleting counters; stage=%d delete=%d", stage, delete)
	}
}
