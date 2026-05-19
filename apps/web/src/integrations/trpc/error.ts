import { TRPCError } from "@trpc/server"
import { createError, EvlogError, type ErrorOptions } from "evlog"

type TRPCCode =
  | "PARSE_ERROR"
  | "BAD_REQUEST"
  | "INTERNAL_SERVER_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_SUPPORTED"
  | "TIMEOUT"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNPROCESSABLE_CONTENT"
  | "TOO_MANY_REQUESTS"
  | "CLIENT_CLOSED_REQUEST"

const STATUS_TO_TRPC: Record<number, TRPCCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_SUPPORTED",
  408: "TIMEOUT",
  409: "CONFLICT",
  412: "PRECONDITION_FAILED",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_CONTENT",
  429: "TOO_MANY_REQUESTS",
  499: "CLIENT_CLOSED_REQUEST",
  500: "INTERNAL_SERVER_ERROR",
}

/**
 * Build a `TRPCError` whose cause is an `EvlogError`. The tRPC error
 * formatter ([init.ts](./init.ts)) extracts the structured fields
 * (`code`, `why`, `fix`, `link`) onto `shape.data` so clients calling
 * `parseError()` see them too.
 *
 * Pass an HTTP `status` (e.g. 404) and the matching tRPC code is picked
 * automatically. Override with `trpcCode` if you need to.
 */
export function trpcError(
  opts: ErrorOptions & { trpcCode?: TRPCCode }
): TRPCError {
  const { trpcCode, ...evlogOpts } = opts
  const cause = createError(evlogOpts)
  const status = (cause as EvlogError).statusCode ?? 500
  const code = trpcCode ?? STATUS_TO_TRPC[status] ?? "INTERNAL_SERVER_ERROR"
  return new TRPCError({
    code,
    message: cause.message,
    cause,
  })
}

export { EvlogError }
