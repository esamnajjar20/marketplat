package analyticssummary

import (
	"encoding/json"
	"testing"
	"time"
)

func TestValidateAcceptsBoundedRequest(t *testing.T) {
	request := Request{
		From:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		To:     time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
		Bucket: "day",
	}
	if err := Validate(request); err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
}

func TestValidateRejectsInvalidRangeAndBucket(t *testing.T) {
	base := Request{
		From:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		To:     time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
		Bucket: "day",
	}
	cases := []struct {
		name   string
		mutate func(*Request)
	}{
		{name: "zero from", mutate: func(r *Request) { r.From = time.Time{} }},
		{name: "reversed range", mutate: func(r *Request) { r.From, r.To = r.To, r.From }},
		{name: "range over 365 days", mutate: func(r *Request) { r.To = r.From.Add(MaxRange + time.Second) }},
		{name: "invalid bucket", mutate: func(r *Request) { r.Bucket = "month" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := base
			tc.mutate(&request)
			if err := Validate(request); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestRatioGuardsZeroDenominator(t *testing.T) {
	if got := ratio(4, 0); got != 0 {
		t.Fatalf("ratio(4, 0) = %v, want 0", got)
	}
	if got := ratio(2, 10); got != 0.2 {
		t.Fatalf("ratio(2, 10) = %v, want 0.2", got)
	}
}

func TestSummaryFunnelJSONMatchesExpressContract(t *testing.T) {
	summary := Summary{
		SearchToContact: SearchToContactFunnel{},
		SignupFunnel:    SignupFunnel{},
	}
	payload, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("json.Unmarshal returned error: %v", err)
	}
	var searchToContact map[string]json.RawMessage
	if err := json.Unmarshal(decoded["searchToContact"], &searchToContact); err != nil {
		t.Fatalf("decode searchToContact: %v", err)
	}
	if len(searchToContact) != 3 || searchToContact["searchSessions"] == nil || searchToContact["contactSessions"] == nil || searchToContact["conversionRate"] == nil {
		t.Fatalf("searchToContact JSON does not match Express contract: %s", decoded["searchToContact"])
	}
	var signupFunnel map[string]json.RawMessage
	if err := json.Unmarshal(decoded["signupFunnel"], &signupFunnel); err != nil {
		t.Fatalf("decode signupFunnel: %v", err)
	}
	if len(signupFunnel) != 3 || signupFunnel["startedSessions"] == nil || signupFunnel["completedSessions"] == nil || signupFunnel["conversionRate"] == nil {
		t.Fatalf("signupFunnel JSON does not match Express contract: %s", decoded["signupFunnel"])
	}
}
