/**
 * OpenTelemetry tracing setup. Loaded once per worker via the Nitro plugin in
 * `server/plugins/otel.ts`. Sends OTLP/HTTP traces to Axiom (or any OTLP
 * backend — point OTEL_EXPORTER_OTLP_ENDPOINT elsewhere to swap).
 *
 * Wide events / logs continue to go through evlog (see `nitro.config.ts`).
 * This module only handles distributed traces.
 */

import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { resourceFromAttributes } from "@opentelemetry/resources"
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions"

const SERVICE_NAME = "tripwire"
const SERVICE_VERSION = process.env.npm_package_version ?? "0.0.0"

let started = false

export function startTelemetry(): void {
  if (started) return
  started = true

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) {
    // No endpoint configured — skip silently (e.g. local dev without telemetry).
    return
  }

  // Axiom needs `Authorization: Bearer <token>` and a per-dataset header on
  // the traces endpoint. We send to <AXIOM_DOMAIN>/v1/traces and pass
  // X-Axiom-Dataset for the traces-specific dataset.
  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
  if (process.env.AXIOM_TOKEN && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${process.env.AXIOM_TOKEN}`
  }
  if (process.env.AXIOM_TRACES_DATASET && !headers["X-Axiom-Dataset"]) {
    headers["X-Axiom-Dataset"] = process.env.AXIOM_TRACES_DATASET
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
      headers,
    }),
    // Auto-instrument HTTP, fetch, drizzle, pg, fs, etc. Disable noisy
    // ones that would bloat traces for this app.
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  })

  sdk.start()

  const shutdown = async () => {
    try {
      await sdk.shutdown()
    } catch {
      // best-effort
    }
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  // Supports both "k1=v1,k2=v2" and OTel-spec URL-encoded values.
  for (const part of raw.split(",")) {
    const [k, ...rest] = part.split("=")
    const key = k?.trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(rest.join("=").trim())
    } catch {
      out[key] = rest.join("=").trim()
    }
  }
  return out
}
