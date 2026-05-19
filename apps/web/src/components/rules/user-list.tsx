import { useState } from "react"
import { UserPill } from "./user-pill"
import { Button } from "#/components/ui/button"
import { toastFromError } from "#/lib/toast-error"

interface User {
  username: string
  avatarUrl: string
}

interface UserListProps {
  title: string
  description: string
  users: User[]
  onAdd?: (username: string) => Promise<void>
  onRemove?: (username: string) => void
  isAdding?: boolean
}

export function UserList({
  title,
  description,
  users,
  onAdd,
  onRemove,
  isAdding,
}: UserListProps) {
  const [search, setSearch] = useState("")
  const [hasError, setHasError] = useState(false)

  async function handleAdd() {
    const username = search.trim().replace(/^@/, "")
    if (username && onAdd) {
      setHasError(false)
      try {
        await onAdd(username)
        setSearch("")
      } catch (err) {
        setHasError(true)
        toastFromError(err, { fallbackTitle: "User not found" })
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
    if (hasError) setHasError(false)
  }

  return (
    <div className="flex w-full flex-col items-start gap-3 rounded-xl bg-tw-card p-4">
      <div className="flex w-full flex-col items-start gap-2">
        <div className="flex w-full items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="text-base leading-5 font-medium tracking-[-0.02em] text-white">
              {title}
            </div>
            <div className="text-xs leading-4 text-tw-text-secondary">
              {description}
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div
              className={`relative inline-flex h-7 w-64 rounded-[10px] border bg-[oklab(100%_0_0/2.6%)] shadow-[oklch(0%_0_0/5%)_0px_1px_2px] transition-colors ${
                hasError
                  ? "border-red-500 ring-1 ring-red-500"
                  : "border-[oklab(100%_0_0/8%)]"
              }`}
            >
              <input
                type="text"
                value={search}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Search for a user"
                className="h-7 w-full min-w-0 rounded-[10px] border-none bg-transparent px-[11px] text-sm text-white outline-none placeholder:text-[oklab(60.4%_0_0/72%)]"
              />
            </div>
            <Button
              onClick={handleAdd}
              loading={isAdding}
              variant="outline"
              size="sm"
              className="border-[#CDCDCD] bg-white text-black hover:bg-white/90"
            >
              Add
            </Button>
          </div>
        </div>
      </div>
      {users.length > 0 && (
        <div className="flex w-full flex-wrap gap-2 rounded-xl">
          {users.map((user) => (
            <UserPill
              key={user.username}
              username={user.username}
              avatarUrl={user.avatarUrl}
              onRemove={() => onRemove?.(user.username)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
