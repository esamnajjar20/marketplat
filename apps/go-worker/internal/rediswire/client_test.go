package rediswire

import (
	"bufio"
	"strings"
	"testing"
)

func TestReadReplyParsesNestedScanResponse(t *testing.T) {
	input := "*2\r\n$1\r\n0\r\n*2\r\n$9\r\nviews:a-1\r\n$9\r\nviews:a-2\r\n"
	value, err := readReply(bufio.NewReader(strings.NewReader(input)), 0)
	if err != nil {
		t.Fatal(err)
	}
	outer, ok := value.([]any)
	if !ok || len(outer) != 2 || outer[0] != "0" {
		t.Fatalf("unexpected reply: %#v", value)
	}
	keys, ok := outer[1].([]any)
	if !ok || len(keys) != 2 || keys[0] != "views:a-1" || keys[1] != "views:a-2" {
		t.Fatalf("unexpected keys: %#v", outer[1])
	}
}

func TestReadReplyRejectsOversizedBulkReply(t *testing.T) {
	_, err := readReply(bufio.NewReader(strings.NewReader("$16777217\r\n")), 0)
	if err == nil {
		t.Fatal("expected oversized Redis reply to fail")
	}
}

func TestCacheConfigUsesDedicatedTLSURL(t *testing.T) {
	t.Setenv("GO_WORKER_CACHE_REDIS_URL", "rediss://cache-user:cache-pass@cache.example:6380/2")
	cfg, err := CacheConfigFromEnv(&Config{Addr: "primary.example:6379"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil || cfg.Addr != "cache.example:6380" || !cfg.TLS || cfg.Username != "cache-user" || cfg.Password != "cache-pass" || cfg.DB != 2 {
		t.Fatalf("unexpected cache Redis config: %#v", cfg)
	}
}

func TestCacheConfigFallsBackToPrimaryRedisWhenNoDedicatedHostExists(t *testing.T) {
	for _, key := range []string{
		"GO_WORKER_CACHE_REDIS_URL", "GO_WORKER_CACHE_REDIS_HOST", "REDIS_CACHE_HOST",
		"GO_WORKER_CACHE_REDIS_PORT", "REDIS_CACHE_PORT", "REDIS_PORT",
		"GO_WORKER_CACHE_REDIS_USERNAME", "REDIS_CACHE_USERNAME",
		"GO_WORKER_CACHE_REDIS_PASSWORD", "REDIS_CACHE_PASSWORD",
		"GO_WORKER_CACHE_REDIS_TLS", "REDIS_CACHE_TLS", "GO_WORKER_REDIS_TLS", "REDIS_TLS",
	} {
		t.Setenv(key, "")
	}
	primary := &Config{Addr: "primary.example:6379", Username: "app", Password: "secret", TLS: true}
	cfg, err := CacheConfigFromEnv(primary)
	if err != nil {
		t.Fatal(err)
	}
	if cfg != primary {
		t.Fatalf("expected primary config pointer, got %#v", cfg)
	}
}
