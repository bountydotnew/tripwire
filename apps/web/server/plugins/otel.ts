import { definePlugin as defineNitroPlugin } from "nitro"
import { startTelemetry } from "../../src/instrumentation"

/**
 * Boot the OpenTelemetry Node SDK as soon as the Nitro server starts.
 * Tracing must initialize before user code runs so auto-instrumentation
 * can wrap HTTP, fetch, drizzle, etc.
 */
export default defineNitroPlugin(() => {
  startTelemetry()
})
