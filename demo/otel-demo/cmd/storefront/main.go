package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/pathtrace/pathtrace/demo/otel-demo/internal/trace"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func main() {
	ctx := context.Background()
	shutdown, err := trace.Init(ctx, "storefront")
	if err != nil {
		log.Fatal(err)
	}
	defer shutdown(context.Background())

	catalogURL := env("CATALOG_URL", "http://localhost:8091")
	ordersURL := env("ORDERS_URL", "http://localhost:8092")
	client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}

	port := env("PORT", "8090")
	mux := http.NewServeMux()
	mux.Handle("GET /health", otelhttp.NewHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}), "health"))
	mux.Handle("GET /api/products/{id}", otelhttp.NewHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyGET(w, r, client, catalogURL+"/products/"+r.PathValue("id"))
	}), "GET /api/products/{id}"))
	mux.Handle("POST /api/checkout", otelhttp.NewHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		checkout(w, r, client, ordersURL)
	}), "POST /api/checkout"))

	// Background traffic generator for Live Tail demos.
	if env("GENERATE_TRAFFIC", "true") == "true" {
		go trafficLoop(client, catalogURL, ordersURL)
	}

	log.Printf("storefront listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func proxyGET(w http.ResponseWriter, r *http.Request, client *http.Client, url string) {
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func checkout(w http.ResponseWriter, r *http.Request, client *http.Client, ordersURL string) {
	ctx := r.Context()
	tr := otel.Tracer("storefront")
	ctx, span := tr.Start(ctx, "Checkout")
	defer span.End()

	body, _ := io.ReadAll(r.Body)
	span.SetAttributes(attribute.Int("http.request.body.size", len(body)))

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, ordersURL+"/orders", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "orders unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func trafficLoop(client *http.Client, catalogURL, ordersURL string) {
	products := []string{"sku-101", "sku-202", "sku-303"}
	for {
		time.Sleep(time.Duration(800+rand.Intn(2200)) * time.Millisecond)
		id := products[rand.Intn(len(products))]
		ctx := context.Background()
		tr := otel.Tracer("storefront")
		ctx, span := tr.Start(ctx, "DemoTraffic")
		if rand.Float64() < 0.35 {
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, catalogURL+"/products/"+id, nil)
			_, _ = client.Do(req)
		} else {
			payload, _ := json.Marshal(map[string]any{"productId": id, "qty": 1 + rand.Intn(2)})
			req, _ := http.NewRequestWithContext(ctx, http.MethodPost, ordersURL+"/orders", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			_, _ = client.Do(req)
		}
		span.End()
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
