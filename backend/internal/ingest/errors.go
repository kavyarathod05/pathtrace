package ingest

import (
	"errors"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	errUnauthorized = status.Error(codes.Unauthenticated, "invalid ingest key")
	errRateLimited  = status.Error(codes.ResourceExhausted, "rate limit exceeded")
)

// HTTPErrUnauthorized is returned for invalid ingest keys over HTTP.
var HTTPErrUnauthorized = errors.New("invalid ingest key")

// HTTPErrRateLimited is returned when the per-key rate limit is exceeded.
var HTTPErrRateLimited = errors.New("rate limit exceeded")
