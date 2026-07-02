package query

import (
	"strconv"
	"strings"
	"time"
)

func atoiDefault(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// parseTags parses a comma-separated "k=v,k2=v2" string into a map.
func parseTags(raw string) map[string]string {
	if raw == "" {
		return nil
	}
	out := map[string]string{}
	for _, pair := range strings.Split(raw, ",") {
		parts := strings.SplitN(pair, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.TrimSpace(parts[1])
			if k != "" {
				out[k] = v
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// parseDurationUS accepts either a Go duration ("120ms") or a bare millisecond
// number and returns microseconds.
func parseDurationUS(raw string) int64 {
	if raw == "" {
		return 0
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d.Microseconds()
	}
	if ms, err := strconv.ParseFloat(raw, 64); err == nil {
		return int64(ms * 1000)
	}
	return 0
}
