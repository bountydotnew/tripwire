// Public entry point for @tripwire/mcp.
//
// Bridges the canonical @tripwire/tools registry to a Model Context Protocol
// server. The web app's /api/mcp route mounts this; the upcoming CLI can run
// the same adapter against a stdio transport for local agent workflows.

export { registerMcpTools } from "./adapter"
export { SERVER_INSTRUCTIONS } from "@tripwire/tools/guides-content"
