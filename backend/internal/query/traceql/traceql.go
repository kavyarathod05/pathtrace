// Package traceql parses a small TraceQL-like filter DSL into TraceQuery fields.
package traceql

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

// Parse compiles a query string like:
//   service="payments" && duration>250ms && error=true && tag.http.route="POST /checkout"
func Parse(q string, base model.TraceQuery) (model.TraceQuery, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return base, nil
	}
	parts := splitTopLevel(q, "&&")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if err := applyClause(&base, part); err != nil {
			return base, err
		}
	}
	return base, nil
}

func applyClause(q *model.TraceQuery, clause string) error {
	// error=true|false
	if strings.HasPrefix(clause, "error=") {
		v := strings.TrimPrefix(clause, "error=")
		q.OnlyErrors = v == "true"
		return nil
	}
	// duration>250ms, duration>=1s
	if strings.HasPrefix(clause, "duration") {
		return applyDuration(q, clause)
	}
	// tag.key="value"
	if strings.HasPrefix(clause, "tag.") {
		rest := strings.TrimPrefix(clause, "tag.")
		key, val, err := parseKV(rest)
		if err != nil {
			return err
		}
		if q.Tags == nil {
			q.Tags = map[string]string{}
		}
		q.Tags[key] = val
		return nil
	}
	// service="x" or operation="x"
	key, val, err := parseKV(clause)
	if err != nil {
		return fmt.Errorf("invalid clause %q: %w", clause, err)
	}
	switch key {
	case "service":
		q.Service = val
	case "operation":
		q.Operation = val
	default:
		return fmt.Errorf("unknown field %q", key)
	}
	return nil
}

func applyDuration(q *model.TraceQuery, clause string) error {
	var op string
	for _, o := range []string{">=", "<=", ">", "<"} {
		if idx := strings.Index(clause, o); idx > 0 {
			op = o
			raw := strings.TrimSpace(clause[len("duration")+len(o):])
			us, err := parseDurationUS(raw)
			if err != nil {
				return err
			}
			switch op {
			case ">", ">=":
				q.MinDuration = us
			case "<", "<=":
				q.MaxDuration = us
			}
			return nil
		}
	}
	return fmt.Errorf("invalid duration clause %q", clause)
}

func parseKV(clause string) (string, string, error) {
	eq := strings.Index(clause, "=")
	if eq < 0 {
		return "", "", fmt.Errorf("expected key=value")
	}
	key := strings.TrimSpace(clause[:eq])
	val := strings.TrimSpace(clause[eq+1:])
	val = strings.Trim(val, `"'`)
	return key, val, nil
}

func parseDurationUS(raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	if d, err := time.ParseDuration(raw); err == nil {
		return d.Microseconds(), nil
	}
	if strings.HasSuffix(raw, "ms") {
		n, err := strconv.ParseFloat(strings.TrimSuffix(raw, "ms"), 64)
		if err != nil {
			return 0, err
		}
		return int64(n * 1000), nil
	}
	if strings.HasSuffix(raw, "us") {
		n, err := strconv.ParseFloat(strings.TrimSuffix(raw, "us"), 64)
		if err != nil {
			return 0, err
		}
		return int64(n), nil
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid duration %q", raw)
	}
	return int64(n * 1000), nil // bare number = ms
}

func splitTopLevel(s, sep string) []string {
	var out []string
	depth := 0
	start := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"', '\'':
			quote := s[i]
			i++
			for i < len(s) && s[i] != quote {
				if s[i] == '\\' {
					i++
				}
				i++
			}
		case '(':
			depth++
		case ')':
			depth--
		default:
			if depth == 0 && strings.HasPrefix(s[i:], sep) {
				out = append(out, s[start:i])
				i += len(sep) - 1
				start = i + 1
			}
		}
	}
	out = append(out, s[start:])
	return out
}
