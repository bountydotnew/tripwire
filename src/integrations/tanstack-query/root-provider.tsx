import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import superjson from 'superjson'
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'

import type { TRPCRouter } from '#/integrations/trpc/router'
import { TRPCProvider } from '#/integrations/trpc/react'

function getUrl() {
  const base = (() => {
    if (typeof window !== 'undefined') return ''
    return `http://localhost:${process.env.PORT ?? 3000}`
  })()
  return `${base}/api/trpc`
}

// tRPC client is safe to create at module level (no React hooks)
export const trpcClient = createTRPCClient<TRPCRouter>({
  links: [
    httpBatchStreamLink({
      transformer: superjson,
      url: getUrl(),
    }),
  ],
})

// Factory function to create fresh context - called per request/instance
export function createQueryContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  })

  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  })

  return { queryClient, trpc }
}

export type QueryContext = ReturnType<typeof createQueryContext>

export default function TanStackQueryProvider({
  children,
}: {
  children: ReactNode
}) {
  // Create QueryClient once per React tree instance using useState initializer
  // This ensures fresh context per SSR request while remaining stable on client
  const [{ queryClient }] = useState(createQueryContext)

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
