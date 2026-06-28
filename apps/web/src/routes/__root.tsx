import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { Databuddy } from "@databuddy/sdk/react"
import { AutumnProvider } from "autumn-js/react"
import { evlogErrorHandler } from "evlog/nitro/v3"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { AnchoredToastProvider, ToastProvider } from "@tripwire/ui/toast"
import RootProvider from "#/integrations/tanstack-query/root-provider"
import type { QueryContext } from "#/integrations/tanstack-query/root-provider"
import { useEffect, useState } from "react"
import { isReactGrabEnabled, isReactScanEnabled } from "#/lib/feature-flags"
import { FeedbackProvider, FeedbackOverlay } from "@tripwire/feedback"
import { FeedbackDialog } from "#/components/shared/feedback-dialog"
import appCss from "../styles.css?url"

function ClientOnlyDevtools() {
  const [Devtools, setDevtools] = useState<React.ComponentType | null>(null)
  useEffect(() => {
    import("@ai-sdk-tools/devtools").then((m) => {
      setDevtools(() => m.AIDevtools)
    })
  }, [])
  return Devtools ? <Devtools /> : null
}

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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {isReactScanEnabled ? (
          <script
            crossOrigin="anonymous"
            src="https://unpkg.com/react-scan/dist/auto.global.js"
          />
        ) : null}
        {isReactGrabEnabled ? (
          <script
            crossOrigin="anonymous"
            src="https://unpkg.com/react-grab/dist/index.global.js"
          />
        ) : null}
        <HeadContent />
      </head>
      <body>
        <RootProvider>
          <NuqsAdapter>
            <AutumnProvider useBetterAuth>
              <ToastProvider>
                <AnchoredToastProvider>
                  <FeedbackProvider endpoint="/api/feedback">
                    <FeedbackOverlay />
                    <FeedbackDialog />
                    {children}
                    <Databuddy
                      clientId="09661145-7249-45d9-a9e3-f1a93e9c7266"
                      trackHashChanges={true}
                      trackAttributes={true}
                      trackOutgoingLinks={true}
                      trackInteractions={true}
                      trackWebVitals={true}
                    />
                  </FeedbackProvider>
                </AnchoredToastProvider>
              </ToastProvider>
            </AutumnProvider>
          </NuqsAdapter>
        </RootProvider>
        {isReactGrabEnabled ? (
          <script
            async
            src="https://unpkg.com/@react-grab/cursor/dist/client.global.js"
          />
        ) : null}
        <Scripts />
        {process.env.NODE_ENV === "development" && <ClientOnlyDevtools />}
      </body>
    </html>
  )
}
