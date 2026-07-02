package ingest

import (
	"context"
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"

	"github.com/pathtrace/pathtrace/internal/config"
	"github.com/pathtrace/pathtrace/internal/metrics"
	"github.com/pathtrace/pathtrace/internal/ratelimit"
)

// GRPCServer serves OTLP trace ingest over gRPC (port 4317 by convention).
type GRPCServer struct {
	coltracepb.UnimplementedTraceServiceServer
	cfg      config.Config
	pipeline *Pipeline
	limiter  *ratelimit.Limiter
}

// NewGRPCServer constructs the gRPC ingest server.
func NewGRPCServer(cfg config.Config, pipeline *Pipeline, limiter *ratelimit.Limiter) *GRPCServer {
	return &GRPCServer{cfg: cfg, pipeline: pipeline, limiter: limiter}
}

// Start listens on cfg.GRPCPort until ctx is cancelled.
func (s *GRPCServer) Start(ctx context.Context) error {
	lis, err := net.Listen("tcp", "0.0.0.0:"+s.cfg.GRPCPort)
	if err != nil {
		return err
	}
	srv := grpc.NewServer()
	coltracepb.RegisterTraceServiceServer(srv, s)
	go func() {
		<-ctx.Done()
		srv.GracefulStop()
	}()
	log.Printf("gRPC OTLP listening on :%s", s.cfg.GRPCPort)
	return srv.Serve(lis)
}

// Export implements the OTLP trace collector gRPC endpoint.
func (s *GRPCServer) Export(ctx context.Context, req *coltracepb.ExportTraceServiceRequest) (*coltracepb.ExportTraceServiceResponse, error) {
	key := metaKey(ctx)
	if !s.limiter.Allow(key) {
		metrics.IngestRequests.WithLabelValues("grpc", "429").Inc()
		return nil, errRateLimited
	}
	project, ok := s.cfg.ProjectForKey(key)
	if !ok {
		metrics.IngestRequests.WithLabelValues("grpc", "401").Inc()
		return nil, errUnauthorized
	}
	spans := ParseProto(req, project)
	metrics.SpansReceived.Add(float64(len(spans)))
	s.pipeline.Accept(spans)
	metrics.IngestRequests.WithLabelValues("grpc", "200").Inc()
	return &coltracepb.ExportTraceServiceResponse{}, nil
}

func metaKey(ctx context.Context) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	vals := md.Get("x-pathtrace-key")
	if len(vals) > 0 {
		return vals[0]
	}
	return ""
}
