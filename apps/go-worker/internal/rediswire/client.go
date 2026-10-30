package rediswire

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const maxReplyBytes = 16 << 20

type Config struct {
	Addr     string
	Username string
	Password string
	TLS      bool
	DB       int
}

type Conn struct {
	netConn net.Conn
	reader  *bufio.Reader
	writer  *bufio.Writer
}

// ConfigFromEnv supports the managed Redis URL form and the same host/port/
// ACL variables used by the Express API. Missing Redis configuration is not
// fatal: Go-only Redis jobs then return an error and Express performs fallback.
func ConfigFromEnv() (*Config, error) {
	rawURL := strings.TrimSpace(firstEnv("GO_WORKER_REDIS_URL", "REDIS_URL"))
	if rawURL != "" {
		parsed, err := url.Parse(rawURL)
		if err != nil || (parsed.Scheme != "redis" && parsed.Scheme != "rediss") || parsed.Hostname() == "" {
			return nil, errors.New("invalid Redis URL")
		}
		port := parsed.Port()
		if port == "" {
			port = "6379"
		}
		portNumber, err := strconv.Atoi(port)
		if err != nil || portNumber < 1 || portNumber > 65535 {
			return nil, errors.New("invalid Redis URL port")
		}
		cfg := &Config{Addr: net.JoinHostPort(parsed.Hostname(), port), TLS: parsed.Scheme == "rediss"}
		if parsed.User != nil {
			cfg.Username = parsed.User.Username()
			cfg.Password, _ = parsed.User.Password()
		}
		if path := strings.TrimPrefix(parsed.Path, "/"); path != "" {
			cfg.DB, err = strconv.Atoi(path)
			if err != nil || cfg.DB < 0 {
				return nil, errors.New("invalid Redis database number")
			}
		}
		if cfg.Username == "" && cfg.Password != "" {
			cfg.Username = strings.TrimSpace(firstEnv("GO_WORKER_REDIS_USERNAME", "REDIS_USERNAME"))
		}
		return cfg, nil
	}

	host := strings.TrimSpace(firstEnv("GO_WORKER_REDIS_HOST", "REDIS_HOST"))
	if host == "" {
		return nil, nil
	}
	port := strings.TrimSpace(firstEnv("GO_WORKER_REDIS_PORT", "REDIS_PORT"))
	if port == "" {
		port = "6379"
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return nil, errors.New("invalid Redis port")
	}
	db := 0
	if value := strings.TrimSpace(os.Getenv("GO_WORKER_REDIS_DB")); value != "" {
		db, err = strconv.Atoi(value)
		if err != nil || db < 0 {
			return nil, errors.New("invalid Redis database number")
		}
	}
	tlsEnabled := strings.EqualFold(strings.TrimSpace(firstEnv("GO_WORKER_REDIS_TLS", "REDIS_TLS")), "true")
	return &Config{
		Addr:     net.JoinHostPort(host, port),
		Username: strings.TrimSpace(firstEnv("GO_WORKER_REDIS_USERNAME", "REDIS_USERNAME")),
		Password: strings.TrimSpace(firstEnv("GO_WORKER_REDIS_PASSWORD", "REDIS_PASSWORD")),
		TLS:      tlsEnabled,
		DB:       db,
	}, nil
}

// CacheConfigFromEnv mirrors Express cacheRedis selection: when a dedicated
// cache Redis host is configured it is used; otherwise the primary Redis
// connection is shared. A URL may override the host/port/ACL/TLS tuple.
func CacheConfigFromEnv(primary *Config) (*Config, error) {
	if rawURL := strings.TrimSpace(os.Getenv("GO_WORKER_CACHE_REDIS_URL")); rawURL != "" {
		cfg, err := parseRedisURL(rawURL, "GO_WORKER_CACHE_REDIS_USERNAME", "GO_WORKER_CACHE_REDIS_PASSWORD")
		if err != nil {
			return nil, err
		}
		if cfg.Username == "" {
			cfg.Username = strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_USERNAME", "REDIS_CACHE_USERNAME"))
		}
		if cfg.Password == "" {
			cfg.Password = strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_PASSWORD", "REDIS_CACHE_PASSWORD"))
		}
		return cfg, nil
	}
	host := strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_HOST", "REDIS_CACHE_HOST"))
	if host == "" {
		return primary, nil
	}
	port := strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_PORT", "REDIS_CACHE_PORT", "REDIS_PORT"))
	if port == "" {
		port = "6379"
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return nil, errors.New("invalid cache Redis port")
	}
	username := strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_USERNAME", "REDIS_CACHE_USERNAME"))
	password := strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_PASSWORD", "REDIS_CACHE_PASSWORD"))
	if primary != nil {
		if username == "" {
			username = primary.Username
		}
		if password == "" {
			password = primary.Password
		}
	}
	tlsValue := strings.TrimSpace(firstEnv("GO_WORKER_CACHE_REDIS_TLS", "REDIS_CACHE_TLS"))
	if tlsValue == "" {
		tlsValue = strings.TrimSpace(firstEnv("GO_WORKER_REDIS_TLS", "REDIS_TLS"))
	}
	return &Config{
		Addr:     net.JoinHostPort(host, port),
		Username: username,
		Password: password,
		TLS:      strings.EqualFold(tlsValue, "true"),
	}, nil
}

func parseRedisURL(rawURL, usernameEnv, passwordEnv string) (*Config, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "redis" && parsed.Scheme != "rediss") || parsed.Hostname() == "" {
		return nil, errors.New("invalid Redis URL")
	}
	port := parsed.Port()
	if port == "" {
		port = "6379"
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return nil, errors.New("invalid Redis URL port")
	}
	cfg := &Config{Addr: net.JoinHostPort(parsed.Hostname(), port), TLS: parsed.Scheme == "rediss"}
	if parsed.User != nil {
		cfg.Username = parsed.User.Username()
		cfg.Password, _ = parsed.User.Password()
	}
	if cfg.Username == "" && cfg.Password == "" {
		cfg.Username = strings.TrimSpace(os.Getenv(usernameEnv))
		cfg.Password = strings.TrimSpace(os.Getenv(passwordEnv))
	}
	if path := strings.TrimPrefix(parsed.Path, "/"); path != "" {
		cfg.DB, err = strconv.Atoi(path)
		if err != nil || cfg.DB < 0 {
			return nil, errors.New("invalid Redis database number")
		}
	}
	return cfg, nil
}

func Dial(ctx context.Context, cfg *Config) (*Conn, error) {
	if cfg == nil || strings.TrimSpace(cfg.Addr) == "" {
		return nil, errors.New("Redis is not configured")
	}
	dialer := &net.Dialer{Timeout: 4 * time.Second, KeepAlive: 10 * time.Second}
	netConn, err := dialer.DialContext(ctx, "tcp", cfg.Addr)
	if err != nil {
		return nil, fmt.Errorf("connect Redis: %w", err)
	}
	if cfg.TLS {
		host, _, _ := net.SplitHostPort(cfg.Addr)
		tlsConn := tls.Client(netConn, &tls.Config{MinVersion: tls.VersionTLS12, ServerName: host})
		if deadline, ok := ctx.Deadline(); ok {
			_ = tlsConn.SetDeadline(deadline)
		}
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			_ = netConn.Close()
			return nil, fmt.Errorf("Redis TLS handshake: %w", err)
		}
		netConn = tlsConn
	}
	conn := &Conn{netConn: netConn, reader: bufio.NewReader(netConn), writer: bufio.NewWriter(netConn)}
	if cfg.Password != "" {
		var authArgs []string
		if cfg.Username != "" {
			authArgs = []string{"AUTH", cfg.Username, cfg.Password}
		} else {
			authArgs = []string{"AUTH", cfg.Password}
		}
		if _, err := conn.Do(ctx, authArgs...); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("authenticate Redis: %w", err)
		}
	}
	if cfg.DB > 0 {
		if _, err := conn.Do(ctx, "SELECT", strconv.Itoa(cfg.DB)); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("select Redis database: %w", err)
		}
	}
	return conn, nil
}

func (c *Conn) Close() error {
	if c == nil || c.netConn == nil {
		return nil
	}
	return c.netConn.Close()
}

func (c *Conn) Do(ctx context.Context, args ...string) (any, error) {
	if len(args) == 0 {
		return nil, errors.New("Redis command is empty")
	}
	deadline := time.Now().Add(10 * time.Second)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}
	if err := c.netConn.SetDeadline(deadline); err != nil {
		return nil, err
	}
	var request strings.Builder
	request.WriteByte('*')
	request.WriteString(strconv.Itoa(len(args)))
	request.WriteString("\r\n")
	for _, arg := range args {
		request.WriteByte('$')
		request.WriteString(strconv.Itoa(len([]byte(arg))))
		request.WriteString("\r\n")
		request.WriteString(arg)
		request.WriteString("\r\n")
	}
	if _, err := c.writer.WriteString(request.String()); err != nil {
		return nil, err
	}
	if err := c.writer.Flush(); err != nil {
		return nil, err
	}
	return readReply(c.reader, 0)
}

func readReply(reader *bufio.Reader, depth int) (any, error) {
	if depth > 8 {
		return nil, errors.New("Redis response nesting limit exceeded")
	}
	prefix, err := reader.ReadByte()
	if err != nil {
		return nil, err
	}
	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
	switch prefix {
	case '+':
		return line, nil
	case '-':
		return nil, errors.New("Redis: " + line)
	case ':':
		return strconv.ParseInt(line, 10, 64)
	case '$':
		n, err := strconv.Atoi(line)
		if err != nil {
			return nil, err
		}
		if n == -1 {
			return nil, nil
		}
		if n < 0 || n > maxReplyBytes {
			return nil, errors.New("Redis bulk response size is invalid")
		}
		buffer := make([]byte, n+2)
		if _, err := io.ReadFull(reader, buffer); err != nil {
			return nil, err
		}
		if buffer[n] != '\r' || buffer[n+1] != '\n' {
			return nil, errors.New("Redis bulk response terminator is invalid")
		}
		return string(buffer[:n]), nil
	case '*':
		n, err := strconv.Atoi(line)
		if err != nil {
			return nil, err
		}
		if n == -1 {
			return nil, nil
		}
		if n < 0 || n > 10000 {
			return nil, errors.New("Redis array response size is invalid")
		}
		items := make([]any, n)
		for i := range items {
			items[i], err = readReply(reader, depth+1)
			if err != nil {
				return nil, err
			}
		}
		return items, nil
	default:
		return nil, fmt.Errorf("unsupported Redis response prefix %q", prefix)
	}
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
