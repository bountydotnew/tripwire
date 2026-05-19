// Public entry point for @tripwire/ui.
//
// catalog  : json-render component schemas (ActionResult, UserCard, etc.)
// registry : React renderers that paint those schemas to DOM
//
// App-specific React hooks (chat-context, use-persisted-chat) live in
// apps/web because they depend on the app's workspace + tRPC client.

export { catalog } from "./catalog"
export { registry } from "./registry"
export type { RenderSpec } from "./types"
