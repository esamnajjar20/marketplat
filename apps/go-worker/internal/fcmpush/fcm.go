package fcmpush

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	oauthTokenURL = "https://oauth2.googleapis.com/token"
	fcmScope      = "https://www.googleapis.com/auth/firebase.messaging"
	fcmBaseURL    = "https://fcm.googleapis.com/v1/projects/"
)

type Outcome string

const (
	OutcomeSent         Outcome = "sent"
	OutcomeGone         Outcome = "gone"
	OutcomeTransient    Outcome = "transient"
	OutcomeFailed       Outcome = "failed"
	OutcomeUnconfigured Outcome = "unconfigured"
)

type Payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"`
	Tag   string `json:"tag,omitempty"`
}

type Client struct {
	projectID            string
	clientEmail          string
	privateKey           *rsa.PrivateKey
	privateKeyConfigured bool
	httpClient           *http.Client
	oauthURL             string
	fcmURL               string
	now                  func() time.Time

	mu                sync.Mutex
	accessToken       string
	accessTokenExpiry time.Time
}

// NewFromEnv reads the same Firebase service-account variables used by Express.
// Keep the credentials on the Go service; never send a service-account key or
// raw device token over the Express-to-Go request.
func NewFromEnv() *Client {
	return New(
		strings.TrimSpace(os.Getenv("FIREBASE_PROJECT_ID")),
		strings.TrimSpace(os.Getenv("FIREBASE_CLIENT_EMAIL")),
		strings.ReplaceAll(os.Getenv("FIREBASE_PRIVATE_KEY"), `\n`, "\n"),
		nil,
	)
}

func New(projectID, clientEmail, privateKey string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 12 * time.Second}
	}
	client := &Client{
		projectID:   strings.TrimSpace(projectID),
		clientEmail: strings.TrimSpace(clientEmail),
		httpClient:  httpClient,
		oauthURL:    oauthTokenURL,
		fcmURL:      fcmBaseURL,
		now:         time.Now,
	}
	if strings.TrimSpace(privateKey) != "" {
		client.privateKeyConfigured = true
		client.privateKey, _ = parsePrivateKey(privateKey)
	}
	return client
}

func (c *Client) Configured() bool {
	return c != nil && c.projectID != "" && c.clientEmail != "" && c.privateKeyConfigured
}

func (c *Client) Send(ctx context.Context, deviceToken string, payload Payload) Outcome {
	if !c.Configured() {
		return OutcomeUnconfigured
	}
	if c.privateKey == nil {
		return OutcomeTransient
	}
	deviceToken = strings.TrimSpace(deviceToken)
	if deviceToken == "" || strings.TrimSpace(payload.Title) == "" || len(payload.Title) > 256 || len(payload.Body) > 4096 || len(payload.URL) > 2048 || len(payload.Tag) > 256 {
		return OutcomeFailed
	}

	accessToken, err := c.getAccessToken(ctx)
	if err != nil {
		if isRetryableHTTPError(err) {
			return OutcomeTransient
		}
		return OutcomeFailed
	}

	message := map[string]any{
		"message": map[string]any{
			"token":        deviceToken,
			"notification": map[string]string{"title": payload.Title, "body": payload.Body},
			"data":         map[string]string{"url": payload.URL, "tag": payload.Tag},
		},
	}
	body, err := json.Marshal(message)
	if err != nil {
		return OutcomeFailed
	}
	endpoint := strings.TrimRight(c.fcmURL, "/") + "/" + url.PathEscape(c.projectID) + "/messages:send"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return OutcomeFailed
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json; charset=utf-8")
	request.Header.Set("Accept", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return OutcomeTransient
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 32*1024))
	if readErr != nil {
		return OutcomeTransient
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return OutcomeSent
	}
	if isUnregistered(responseBody) {
		return OutcomeGone
	}
	if isRetryableStatus(response.StatusCode) {
		return OutcomeTransient
	}
	return OutcomeFailed
}

func (c *Client) getAccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	if c.accessToken != "" && now.Add(60*time.Second).Before(c.accessTokenExpiry) {
		return c.accessToken, nil
	}
	assertion, err := c.signedAssertion(now)
	if err != nil {
		return "", err
	}
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", assertion)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.oauthURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", &transportError{cause: err}
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 16*1024))
	if readErr != nil {
		return "", &transportError{cause: readErr}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", &httpStatusError{status: response.StatusCode}
	}
	var tokenResponse struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(responseBody, &tokenResponse); err != nil {
		return "", err
	}
	if tokenResponse.AccessToken == "" || tokenResponse.ExpiresIn < 120 || tokenResponse.TokenType != "Bearer" {
		return "", errors.New("OAuth token response is incomplete")
	}
	c.accessToken = tokenResponse.AccessToken
	c.accessTokenExpiry = now.Add(time.Duration(tokenResponse.ExpiresIn) * time.Second)
	return c.accessToken, nil
}

func (c *Client) signedAssertion(now time.Time) (string, error) {
	if c.privateKey == nil {
		return "", errors.New("Firebase private key is not configured")
	}
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	claims, err := json.Marshal(map[string]any{
		"iss":   c.clientEmail,
		"scope": fcmScope,
		"aud":   c.oauthURL,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	})
	if err != nil {
		return "", err
	}
	unsigned := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(claims)
	digest := sha256.Sum256([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, c.privateKey, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("sign Firebase OAuth assertion: %w", err)
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func parsePrivateKey(raw string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(strings.ReplaceAll(raw, `\n`, "\n")))
	if block == nil {
		return nil, errors.New("Firebase private key is not valid PEM")
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, errors.New("Firebase private key is not RSA")
	}
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, errors.New("Firebase private key could not be parsed")
	}
	return key, nil
}

type httpStatusError struct{ status int }

type transportError struct{ cause error }

func (e *transportError) Error() string { return "Firebase OAuth transport failed" }
func (e *transportError) Unwrap() error { return e.cause }

func (e *httpStatusError) Error() string {
	return "Firebase OAuth returned HTTP " + strconv.Itoa(e.status)
}

func isRetryableHTTPError(err error) bool {
	var transportErr *transportError
	if errors.As(err, &transportErr) {
		return true
	}
	var statusErr *httpStatusError
	if errors.As(err, &statusErr) {
		return isRetryableStatus(statusErr.status)
	}
	return false
}

func isRetryableStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || status >= 500
}

func isUnregistered(body []byte) bool {
	var response struct {
		Error struct {
			Details []struct {
				Type      string `json:"@type"`
				ErrorCode string `json:"errorCode"`
			} `json:"details"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &response) != nil {
		return false
	}
	for _, detail := range response.Error.Details {
		if strings.HasSuffix(detail.Type, ".FcmError") && detail.ErrorCode == "UNREGISTERED" {
			return true
		}
	}
	return false
}
