import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useWorkspace } from "#/providers/workspace-context"
import { RepoSwitchDialog } from "#/components/repo-switch-dialog"

interface Repo {
  id: string
  name: string
  fullName: string
}

/**
 * A chat surface registers when it has an in-progress conversation
 * the user might lose context on. Used by the gate to decide whether
 * a repo switch needs confirmation.
 *
 * `startNewChatWithMarker` is called on the "Start new chat" branch:
 * the surface should clear its thread and seed it with a single
 * context-switch divider for the new repo.
 *
 * `appendMarker` is called on the "Switch context" branch: the
 * surface keeps its existing messages and appends a context-switch
 * divider so the user can see where the new repo's context begins.
 */
interface ActiveChatDescriptor {
  hasMessages: boolean
  isOpen: boolean
  startNewChatWithMarker: (repoName: string) => void
  appendMarker: (repoName: string) => void
}

interface RepoSwitchGateContextValue {
  requestRepoSwitch: (next: Repo) => void
  registerActiveChat: (id: string, descriptor: ActiveChatDescriptor) => void
  unregisterActiveChat: (id: string) => void
}

const RepoSwitchGateContext = createContext<RepoSwitchGateContextValue>({
  requestRepoSwitch: () => {},
  registerActiveChat: () => {},
  unregisterActiveChat: () => {},
})

interface ProviderProps {
  children: ReactNode
}

/**
 * Intercepts repo switches when a chat surface has an active
 * conversation open, prompting the user to choose between cancelling,
 * starting a new chat, or carrying the current thread to the new
 * repo (next message uses the new repo's context).
 *
 * No-op when no chat surface is registered, or when the registered
 * surface is closed / empty.
 */
export function RepoSwitchGateProvider({ children }: ProviderProps) {
  const { repo: currentRepo, setRepo } = useWorkspace()
  const activeChats = useRef(new Map<string, ActiveChatDescriptor>())
  const [pending, setPending] = useState<Repo | null>(null)

  const registerActiveChat = useCallback(
    (id: string, descriptor: ActiveChatDescriptor) => {
      activeChats.current.set(id, descriptor)
    },
    []
  )

  const unregisterActiveChat = useCallback((id: string) => {
    activeChats.current.delete(id)
  }, [])

  const requestRepoSwitch = useCallback(
    (next: Repo) => {
      if (currentRepo?.id === next.id) return

      let needsConfirmation = false
      for (const descriptor of activeChats.current.values()) {
        if (descriptor.hasMessages && descriptor.isOpen) {
          needsConfirmation = true
          break
        }
      }

      if (!needsConfirmation) {
        setRepo(next)
        return
      }

      setPending(next)
    },
    [currentRepo?.id, setRepo]
  )

  const handleCancel = useCallback(() => {
    setPending(null)
  }, [])

  const handleProceed = useCallback(() => {
    if (!pending) return
    for (const descriptor of activeChats.current.values()) {
      if (descriptor.hasMessages && descriptor.isOpen) {
        descriptor.appendMarker(pending.fullName)
      }
    }
    setRepo(pending)
    setPending(null)
  }, [pending, setRepo])

  const handleNewChat = useCallback(() => {
    if (!pending) return
    for (const descriptor of activeChats.current.values()) {
      if (descriptor.hasMessages && descriptor.isOpen) {
        descriptor.startNewChatWithMarker(pending.fullName)
      }
    }
    setRepo(pending)
    setPending(null)
  }, [pending, setRepo])

  const value = useMemo<RepoSwitchGateContextValue>(
    () => ({ requestRepoSwitch, registerActiveChat, unregisterActiveChat }),
    [requestRepoSwitch, registerActiveChat, unregisterActiveChat]
  )

  return (
    <RepoSwitchGateContext.Provider value={value}>
      {children}
      <RepoSwitchDialog
        open={pending !== null}
        currentRepoName={currentRepo?.fullName ?? null}
        nextRepoName={pending?.fullName ?? null}
        onCancel={handleCancel}
        onProceed={handleProceed}
        onNewChat={handleNewChat}
      />
    </RepoSwitchGateContext.Provider>
  )
}

export function useRepoSwitchGate() {
  return useContext(RepoSwitchGateContext)
}

/**
 * Convenience hook for chat surfaces. Pass a stable surface id and
 * the live descriptor; the hook keeps the registered descriptor in
 * sync with the latest render via a ref, so the gate always sees
 * current `hasMessages` / `isOpen` without churning the underlying
 * register/unregister cycle on every render.
 */
export function useRegisterChatSurface(
  surfaceId: string,
  descriptor: ActiveChatDescriptor
): void {
  const { registerActiveChat, unregisterActiveChat } = useRepoSwitchGate()
  const latest = useRef(descriptor)
  latest.current = descriptor

  useEffect(() => {
    const stable: ActiveChatDescriptor = {
      get hasMessages() {
        return latest.current.hasMessages
      },
      get isOpen() {
        return latest.current.isOpen
      },
      startNewChatWithMarker: (repoName) =>
        latest.current.startNewChatWithMarker(repoName),
      appendMarker: (repoName) => latest.current.appendMarker(repoName),
    }
    registerActiveChat(surfaceId, stable)
    return () => unregisterActiveChat(surfaceId)
  }, [surfaceId, registerActiveChat, unregisterActiveChat])
}
