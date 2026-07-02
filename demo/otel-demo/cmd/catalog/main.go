package main

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/pathtrace/pathtrace/demo/otel-demo/internal/trace"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

type product struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
}

var catalog = map[string]product{
	"sku-101": {ID: "sku-101", Name: "Trail Runner Pro", Price: 129.99, Stock: 42},
	"sku-202": {ID: "sku-202", Name: "Summit Pack 28L", Price: 89.50, Stock: 18},
	"sku-303": {ID: "sku-303", Name: "Alpine Shell Jacket", Price: 219.00, Stock: 7},
}

func main() {
	ctx := context.Background()
	shutdown, err := trace.Init(ctx, "catalog")
	if err != nil {
		log.Fatal(err)
	}
	defer shutdown(context.Background())

	port := env("PORT", "8091")
	mux := http.NewServeMux()
	mux.Handle("GET /health", otelhttp.NewHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}), "health"))
	mux.Handle("GET /products/{id}", otelhttp.NewHandler(http.HandlerFunc(getProduct), "GET /products/{id}"))

	log.Printf("catalog listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func getProduct(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tr := otel.Tracer("catalog")
	_, span := tr.Start(ctx, "LoadProduct")
	defer span.End()

	id := r.PathValue("id")
	span.SetAttributes(attribute.String("product.id", id))

	// Simulate DB latency.
	time.Sleep(time.Duration(8+rand.Intn(25)) * time.Millisecond)

	p, ok := catalog[id]
	if !ok {
		span.SetStatus(codes.Error, "not found")
		http.NotFound(w, r)
		return
	}
	if p.Stock == 0 {
		span.SetStatus(codes.Error, "out of stock")
		http.Error(w, "out of stock", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
