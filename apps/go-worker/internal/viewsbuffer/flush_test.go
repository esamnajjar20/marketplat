package viewsbuffer

import "testing"

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
