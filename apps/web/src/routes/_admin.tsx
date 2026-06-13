import { createFileRoute } from "@tanstack/react-router"
import { AdminShell } from "#/components/layout/admin/admin-shell"
import { privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_admin")({
  component: AdminShell,
  headers: () => privateHeaders,
})
