package fcmpush

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func testServiceAccountKey(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
}

func newTestClient(t *testing.T, fcmStatus int, fcmBody string, oauthStatus int) (*Client, *atomic.Int32, *atomic.Int32) {
	t.Helper()
	var oauthCalls atomic.Int32
	var fcmCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/oauth":
			oauthCalls.Add(1)
			if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
				t.Errorf("unexpected OAuth request: %s %s", r.Method, r.URL.Path)
			}
			formBytes, _ := io.ReadAll(r.Body)
			form, _ := url.ParseQuery(string(formBytes))
			if form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" {
				t.Errorf("unexpected grant_type: %q", form.Get("grant_type"))
			}
			parts := strings.Split(form.Get("assertion"), ".")
			if len(parts) != 3 {
				t.Errorf("expected signed JWT assertion, got %d parts", len(parts))
			} else {
				claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
				if err != nil {
					t.Errorf("decode JWT claims: %v", err)
				} else {
					var claims map[string]any
					if err := json.Unmarshal(claimsJSON, &claims); err != nil {
						t.Errorf("parse JWT claims: %v", err)
					} else if claims["iss"] != "worker@example.test" || claims["scope"] != fcmScope {
						t.Errorf("unexpected JWT claims: %#v", claims)
					}
				}
			}
			if oauthStatus != http.StatusOK {
				w.WriteHeader(oauthStatus)
				_, _ = io.WriteString(w, `{"error":"oauth failure"}`)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"access_token":"test-access-token","expires_in":3600,"token_type":"Bearer"}`)
		case "/v1/projects/test-project/messages:send":
			fcmCalls.Add(1)
			if r.Header.Get("Authorization") != "Bearer test-access-token" {
				t.Errorf("unexpected FCM authorization header")
			}
			var request struct {
				Message struct {
					Token        string            `json:"token"`
					Notification map[string]string `json:"notification"`
					Data         map[string]string `json:"data"`
				} `json:"message"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Errorf("decode FCM message: %v", err)
			}
			if request.Message.Token != "device-token-secret" || request.Message.Notification["title"] != "Hello" || (request.Message.Data["url"] != "" && request.Message.Data["url"] != "/inbox") {
				t.Errorf("unexpected FCM message: %#v", request.Message)
			}
			w.WriteHeader(fcmStatus)
			_, _ = io.WriteString(w, fcmBody)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client := New("test-project", "worker@example.test", testServiceAccountKey(t), server.Client())
	client.oauthURL = server.URL + "/oauth"
	client.fcmURL = server.URL + "/v1/projects/"
	return client, &oauthCalls, &fcmCalls
}

func TestSendUsesOAuthAndFCMHTTPV1(t *testing.T) {
	client, oauthCalls, fcmCalls := newTestClient(t, http.StatusOK, `{"name":"projects/test-project/messages/123"}`, http.StatusOK)
	outcome := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello", Body: "World", URL: "/inbox", Tag: "notice"})
	if outcome != OutcomeSent {
		t.Fatalf("expected sent, got %q", outcome)
	}
	if oauthCalls.Load() != 1 || fcmCalls.Load() != 1 {
		t.Fatalf("unexpected call counts: oauth=%d fcm=%d", oauthCalls.Load(), fcmCalls.Load())
	}
}

func TestOAuthTokenIsCachedBetweenSends(t *testing.T) {
	client, oauthCalls, fcmCalls := newTestClient(t, http.StatusOK, `{}`, http.StatusOK)
	for i := 0; i < 2; i++ {
		if got := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello", Body: "World"}); got != OutcomeSent {
			t.Fatalf("send %d: expected sent, got %q", i, got)
		}
	}
	if oauthCalls.Load() != 1 || fcmCalls.Load() != 2 {
		t.Fatalf("expected one OAuth exchange and two FCM calls, got oauth=%d fcm=%d", oauthCalls.Load(), fcmCalls.Load())
	}
}

func TestUnregisteredTokenIsGone(t *testing.T) {
	body := `{"error":{"status":"NOT_FOUND","details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"UNREGISTERED"}]}}`
	client, _, _ := newTestClient(t, http.StatusNotFound, body, http.StatusOK)
	if got := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello"}); got != OutcomeGone {
		t.Fatalf("expected gone, got %q", got)
	}
}

func TestRetryableProviderStatusesAreTransient(t *testing.T) {
	for _, status := range []int{http.StatusRequestTimeout, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			client, _, _ := newTestClient(t, status, `{}`, http.StatusOK)
			if got := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello"}); got != OutcomeTransient {
				t.Fatalf("expected transient for HTTP %d, got %q", status, got)
			}
		})
	}
}

func TestInvalidArgumentIsNotTreatedAsDeadToken(t *testing.T) {
	body := `{"error":{"status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"INVALID_ARGUMENT"}]}}`
	client, _, _ := newTestClient(t, http.StatusBadRequest, body, http.StatusOK)
	if got := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello"}); got != OutcomeFailed {
		t.Fatalf("expected failed, got %q", got)
	}
}

func TestMissingCredentialsAreUnconfiguredAndMalformedCredentialsRetry(t *testing.T) {
	if got := New("", "", "", nil).Send(context.Background(), "token", Payload{Title: "Hello"}); got != OutcomeUnconfigured {
		t.Fatalf("expected unconfigured, got %q", got)
	}
	client := New("project", "service@example.test", "not-a-pem", nil)
	if got := client.Send(context.Background(), "token", Payload{Title: "Hello"}); got != OutcomeTransient {
		t.Fatalf("expected malformed credentials to remain retryable, got %q", got)
	}
}

func TestOAuthFailuresKeepTransientAndPermanentClassesSeparate(t *testing.T) {
	t.Run("service unavailable", func(t *testing.T) {
		client, _, fcmCalls := newTestClient(t, http.StatusOK, `{}`, http.StatusServiceUnavailable)
		if got := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello"}); got != OutcomeTransient {
			t.Fatalf("expected transient, got %q", got)
		}
		if fcmCalls.Load() != 0 {
			t.Fatal("FCM must not be called when OAuth token exchange fails")
		}
	})
	t.Run("invalid credentials", func(t *testing.T) {
		client, _, fcmCalls := newTestClient(t, http.StatusOK, `{}`, http.StatusUnauthorized)
		if got := client.Send(context.Background(), "device-token-secret", Payload{Title: "Hello"}); got != OutcomeFailed {
			t.Fatalf("expected permanent failure, got %q", got)
		}
		if fcmCalls.Load() != 0 {
			t.Fatal("FCM must not be called when OAuth token exchange fails")
		}
	})
}
