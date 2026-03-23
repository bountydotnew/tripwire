import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { trpcRouter } from '#/integrations/trpc/router'
import { createContext } from '#/integrations/trpc/init'
import { createFileRoute } from '@tanstack/react-router'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: '/api/trpc',
    createContext: () => createContext({ headers: request.headers }),
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})
