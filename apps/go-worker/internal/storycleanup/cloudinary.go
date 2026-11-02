package storycleanup

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type Client struct {
	cloudName string
	apiKey    string
	apiSecret string
	http      *http.Client
	baseURL   string
}

func NewClient(cloudName, apiKey, apiSecret string) *Client {
	return &Client{
		cloudName: strings.TrimSpace(cloudName),
		apiKey:    strings.TrimSpace(apiKey),
		apiSecret: strings.TrimSpace(apiSecret),
		http:      &http.Client{Timeout: 8 * time.Second},
		baseURL:   "https://api.cloudinary.com/v1_1/",
	}
}

func (c *Client) Configured() bool {
	return c != nil && c.cloudName != "" && c.apiKey != "" && c.apiSecret != ""
}

// Delete is kept as the image-resource convenience used by story cleanup.
func (c *Client) Delete(ctx context.Context, publicID string) error {
	return c.DeleteResource(ctx, publicID, "image")
}

// DeleteResource uses Cloudinary's signed Upload API destroy endpoint for image,
// video, or raw resources. A "not found" response is success, making retries
// safe after Cloudinary accepted a delete but the caller lost the response.
func (c *Client) DeleteResource(ctx context.Context, publicID, resourceType string) error {
	if !c.Configured() {
		return fmt.Errorf("Cloudinary credentials are not configured")
	}
	publicID = strings.TrimSpace(publicID)
	if publicID == "" {
		return nil
	}
	if resourceType != "image" && resourceType != "video" && resourceType != "raw" {
		return fmt.Errorf("unsupported Cloudinary resource type %q", resourceType)
	}
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	params := map[string]string{"public_id": publicID, "timestamp": timestamp}
	keys := []string{"public_id", "timestamp"}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+params[key])
	}
	signatureInput := strings.Join(parts, "&") + c.apiSecret
	digest := sha1.Sum([]byte(signatureInput))
	signature := hex.EncodeToString(digest[:])

	form := url.Values{}
	form.Set("public_id", publicID)
	form.Set("timestamp", timestamp)
	form.Set("api_key", c.apiKey)
	form.Set("signature", signature)
	endpoint := strings.TrimRight(c.baseURL, "/") + "/" + url.PathEscape(c.cloudName) + "/" + resourceType + "/destroy"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("build Cloudinary destroy request: %w", err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("Cloudinary destroy request failed: %w", err)
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, 16*1024))
	if readErr != nil {
		return fmt.Errorf("read Cloudinary destroy response: %w", readErr)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Cloudinary destroy returned HTTP %d", response.StatusCode)
	}
	var result struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("decode Cloudinary destroy response: %w", err)
	}
	if result.Result != "ok" && result.Result != "not found" {
		return fmt.Errorf("Cloudinary destroy returned unexpected result %q", result.Result)
	}
	return nil
}
