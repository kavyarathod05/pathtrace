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
	"go.opentelemetry.io/otel/codes"
)

type orderRequest struct {
	ProductID string `json:"productId"`
	Qty       int    `json:"qty"`
}

type orderResponse struct {
	OrderID string  `json:"orderId"`
	Total   float64 `json:"total"`
	Status  string  `json:"status"`
}

func main() {
	ctx := context.Background()
	shutdown, err := trace.Init(ctx, "orders")
	if err != nil {
		log.Fatal(err)
	}
	defer shutdown(context.Background())

	catalogURL := env("CATALOG_URL", "http://localhost:8091")
	client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}

	port := env("PORT", "8092")
	mux := http.NewServeMux()
	mux.Handle("GET /health", otelhttp.NewHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}), "health"))
	mux.Handle("POST /orders", otelhttp.NewHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		createOrder(w, r, client, catalogURL)
	}), "POST /orders"))

	log.Printf("orders listening on :%s (catalog=%s)", port, catalogURL)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func createOrder(w http.ResponseWriter, r *http.Request, client *http.Client, catalogURL string) {
	ctx := r.Context()
	tr := otel.Tracer("orders")
	ctx, span := tr.Start(ctx, "CreateOrder")
	defer span.End()

	var req orderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	span.SetAttributes(
		attribute.String("order.product_id", req.ProductID),
		attribute.Int("order.qty", req.Qty),
	)

	// Reserve inventory via catalog lookup.
	ctx, lookup := tr.Start(ctx, "ValidateProduct")
	reqHTTP, _ := http.NewRequestWithContext(ctx, http.MethodGet, catalogURL+"/products/"+req.ProductID, nil)
	resp, err := client.Do(reqHTTP)
	lookup.End()
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		http.Error(w, "catalog unavailable", http.StatusBadGateway)
		return
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		span.SetStatus(codes.Error, "catalog rejected")
		http.Error(w, string(body), resp.StatusCode)
		return
	}

	var prod struct {
		Price float64 `json:"price"`
	}
	_ = json.Unmarshal(body, &prod)

	// Payment simulation — occasional failure.
	ctx, pay := tr.Start(ctx, "ChargePayment")
	time.Sleep(time.Duration(40+rand.Intn(120)) * time.Millisecond)
	if rand.Float64() < 0.06 {
		pay.SetStatus(codes.Error, "card declined")
		pay.End()
		span.SetStatus(codes.Error, "payment failed")
		http.Error(w, "payment declined", http.StatusPaymentRequired)
		return
	}
	pay.End()

	orderID := randomID()
	out := orderResponse{OrderID: orderID, Total: prod.Price * float64(req.Qty), Status: "confirmed"}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func randomID() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := bytes.NewBuffer(make([]byte, 0, 12))
	for i := 0; i < 12; i++ {
		b.WriteByte(chars[rand.Intn(len(chars))])
	}
	return b.String()
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
