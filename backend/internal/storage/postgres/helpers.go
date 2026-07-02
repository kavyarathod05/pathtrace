package postgres

import (
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// sqlBuilder accumulates positional WHERE conditions safely ($1, $2, ...).
type sqlBuilder struct {
	conds []string
	args  []any
}

// where appends a condition using a printf-style template where each %s is
// replaced by the next positional placeholder. Example: where("a = %s", 1).
func (b *sqlBuilder) where(tmpl string, arg any) {
	b.args = append(b.args, arg)
	placeholder := fmt.Sprintf("$%d", len(b.args))
	b.conds = append(b.conds, strings.Replace(tmpl, "%s", placeholder, 1))
}

// whereRaw appends a literal condition with no bound argument.
func (b *sqlBuilder) whereRaw(cond string) {
	b.conds = append(b.conds, cond)
}

func (b *sqlBuilder) clause() string {
	if len(b.conds) == 0 {
		return ""
	}
	return "WHERE " + strings.Join(b.conds, " AND ")
}

func scanStrings(rows pgx.Rows) ([]string, error) {
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func orDefault(project string) string {
	if project == "" {
		return "default"
	}
	return project
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func orEmptyMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

func orEmptySlice[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
