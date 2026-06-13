export interface RequestContext {
  requestId: string
  method?: string
  path?: string
}

/**
 * AsyncLocalStorage is only available in Node.js. In Edge/browser contexts
 * we fall back to a no-op implementation so the logger import doesn't break.
 */
interface Storage<T> {
  getStore(): T | undefined
  run<R>(store: T, fn: () => R): R
}

// Locally typed to avoid requiring `@types/node` to be in scope for every
// consumer of this package. Browser/edge bundles never hit the require()
// branch, so the lack of a real `require` global is fine.
type GlobalWithProcess = {
  process?: { versions?: { node?: string } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  require?: (mod: string) => any
}

let storage: Storage<RequestContext>

const g = globalThis as unknown as GlobalWithProcess
if (typeof g.process !== "undefined" && g.process.versions?.node && g.require) {
  const { AsyncLocalStorage } = g.require("node:async_hooks") as {
    AsyncLocalStorage: new <T>() => Storage<T>
  }
  storage = new AsyncLocalStorage<RequestContext>()
} else {
  storage = {
    getStore: () => undefined,
    run: <R>(_store: RequestContext, fn: () => R) => fn(),
  }
}

/**
 * Runs a callback within a request context. All loggers called inside
 * the callback (and any async functions it awaits) will automatically
 * include the request context metadata in their output.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

/**
 * Returns the current request context, or undefined if called outside
 * of a `runWithRequestContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}
