import { createRootRouteWithContext } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { evlogErrorHandler } from "evlog/nitro/v3"
import { RootDocument } from "#/components/layout/root/root-document"
import type { QueryContext } from "#/integrations/tanstack-query/root-provider"
import appCss from "../styles.css?url"

export const Route = createRootRouteWithContext<QueryContext>()({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Tripwire" },
      { property: "og:site_name", content: "Tripwire" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://tripwire.sh/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://tripwire.sh/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
})
