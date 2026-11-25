package rediswire

import (
	"bufio"
	"context"
	"net"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPoolReusesConnectionAndClosesIdleConnections(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	var accepted atomic.Int32
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		for {
			conn, acceptErr := listener.Accept()
			if acceptErr != nil {
				return
			}
			accepted.Add(1)
			go func(c net.Conn) {
				defer c.Close()
				r := bufio.NewReader(c)
				for {
					line, readErr := r.ReadString('\n')
					if readErr != nil {
						return
					}
					if !strings.HasPrefix(line, "*") {
						return
					}
					count, parseErr := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "*")))
					if parseErr != nil {
						return
					}
					for i := 0; i < count*2; i++ {
						if _, readErr = r.ReadString('\n'); readErr != nil {
							return
						}
					}
					_, _ = c.Write([]byte("+PONG\r\n"))
				}
			}(conn)
		}
	}()

	pool := NewPool(&Config{Addr: listener.Addr().String()}, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for i := 0; i < 2; i++ {
		conn, acquireErr := pool.Acquire(ctx)
		if acquireErr != nil {
			t.Fatal(acquireErr)
		}
		response, commandErr := conn.Do(ctx, "PING")
		pool.Release(conn, commandErr == nil)
		if commandErr != nil || response != "PONG" {
			t.Fatalf("PING = %v, %v; want PONG", response, commandErr)
		}
	}
	if got := accepted.Load(); got != 1 {
		t.Fatalf("accepted connections = %d, want 1", got)
	}
	pool.Close()
	_ = listener.Close()
	select {
	case <-serverDone:
	case <-time.After(time.Second):
		t.Fatal("Redis test server did not stop after pool close")
	}
}

func TestPoolRejectsAcquireWhenClosedOrUnconfigured(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := NewPool(nil, 1).Acquire(ctx); err == nil {
		t.Fatal("expected unconfigured pool error")
	}
	pool := NewPool(&Config{Addr: "127.0.0.1:1"}, 1)
	pool.Close()
	if _, err := pool.Acquire(ctx); err == nil {
		t.Fatal("expected closed pool error")
	}
}
