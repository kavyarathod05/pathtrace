package traceql_test

import (
	"testing"

	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/query/traceql"
)

func TestParseEmpty(t *testing.T) {
	q, err := traceql.Parse("", model.TraceQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q.Service != "" || q.OnlyErrors {
		t.Fatalf("expected unchanged base query, got %+v", q)
	}
}

func TestParseServiceAndOperation(t *testing.T) {
	q, err := traceql.Parse(`service="payments" && operation="ChargeCard"`, model.TraceQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q.Service != "payments" || q.Operation != "ChargeCard" {
		t.Fatalf("got %+v", q)
	}
}

func TestParseDurationAndError(t *testing.T) {
	q, err := traceql.Parse(`duration>250ms && error=true`, model.TraceQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !q.OnlyErrors {
		t.Fatal("expected OnlyErrors")
	}
	if q.MinDuration != 250_000 {
		t.Fatalf("MinDuration = %d, want 250000", q.MinDuration)
	}
}

func TestParseMaxDuration(t *testing.T) {
	q, err := traceql.Parse(`duration<2s`, model.TraceQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q.MaxDuration != 2_000_000 {
		t.Fatalf("MaxDuration = %d, want 2000000", q.MaxDuration)
	}
}

func TestParseTag(t *testing.T) {
	q, err := traceql.Parse(`tag.http.route="POST /checkout"`, model.TraceQuery{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q.Tags["http.route"] != "POST /checkout" {
		t.Fatalf("tags = %+v", q.Tags)
	}
}

func TestParseInvalidClause(t *testing.T) {
	_, err := traceql.Parse(`unknown="foo"`, model.TraceQuery{})
	if err == nil {
		t.Fatal("expected error for unknown field")
	}
}
