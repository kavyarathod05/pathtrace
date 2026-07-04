import type { Span } from "./types";

const CHECKOUT_FLOW: { service: string; operation: string; baseMs: number; errRate: number }[] = [
  { service: "api-gateway", operation: "POST /checkout", baseMs: 420, errRate: 0.01 },
  { service: "checkout", operation: "CreateOrder", baseMs: 95, errRate: 0.02 },
  { service: "inventory", operation: "ReserveStock", baseMs: 110, errRate: 0.05 },
  { service: "postgres", operation: "UPDATE inventory", baseMs: 45, errRate: 0.01 },
  { service: "payments", operation: "ChargeCard", baseMs: 180, errRate: 0.08 },
  { service: "stripe-adapter", operation: "POST /v1/charges", baseMs: 140, errRate: 0.06 },
  { service: "notifications", operation: "SendReceipt", baseMs: 60, errRate: 0.03 },
];

function randHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jitter(baseMs: number): number {
  return Math.max(1000, Math.round(baseMs * (0.7 + Math.random() * 0.6) * 1000));
}

/** Client-side demo live feed when production has no real ingest traffic. */
export function startClientDemoLiveFeed(
  project: string,
  onSpan: (span: Span) => void,
): () => void {
  let active = true;
  let traceId = randHex(16);
  let step = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    if (!active) return;
    const spec = CHECKOUT_FLOW[step % CHECKOUT_FLOW.length];
    if (step % CHECKOUT_FLOW.length === 0) {
      traceId = randHex(16);
    }
    const isErr = Math.random() < spec.errRate;
    onSpan({
      projectId: project,
      traceId,
      spanId: randHex(8),
      serviceName: spec.service,
      operationName: spec.operation,
      kind: "server",
      startTime: new Date().toISOString(),
      durationUs: jitter(spec.baseMs),
      statusCode: isErr ? "ERROR" : "OK",
      tags: spec.operation.startsWith("POST") ? { "http.route": spec.operation } : {},
      events: [],
      refs: [],
    });
    step++;
    const delay = step % CHECKOUT_FLOW.length === 0 ? 700 + Math.random() * 900 : 80 + Math.random() * 120;
    timer = setTimeout(tick, delay);
  };

  timer = setTimeout(tick, 400);

  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
