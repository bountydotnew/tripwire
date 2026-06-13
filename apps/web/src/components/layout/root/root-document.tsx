import { HeadContent, Scripts } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { AutumnProvider } from "autumn-js/react"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { AnchoredToastProvider, ToastProvider } from "@tripwire/ui/toast"
import { FeedbackOverlay, FeedbackProvider } from "@tripwire/feedback"
import { FeedbackDialog } from "#/components/shared/feedback-dialog"
import RootProvider from "#/integrations/tanstack-query/root-provider"
import { isReactGrabEnabled, isReactScanEnabled } from "#/lib/feature-flags"

/**
 * Outer HTML shell rendered by the root TanStack route. Owns every
 * cross-cutting provider (tRPC + react-query, NuqsAdapter, Autumn,
 * Toasts, Feedback) plus the dev-only AI tools devtools.
 */
export function RootDocument({ children }: { children: React.ReactNode }) {
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

function ClientOnlyDevtools() {
  const [Devtools, setDevtools] = useState<React.ComponentType | null>(null)
  useEffect(() => {
    import("@ai-sdk-tools/devtools").then((m) => {
      setDevtools(() => m.AIDevtools)
    })
  }, [])
  return Devtools ? <Devtools /> : null
}
