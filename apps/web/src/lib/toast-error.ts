import { parseError } from "evlog"
import { toastManager } from "#/components/ui/toast"

interface ToastErrorOptions {
  /** Override the title (defaults to the parsed error's `message`). */
  title?: string
  /** Fallback message when the error has none. */
  fallbackTitle?: string
}

/**
 * Render a caught error as a toast using evlog's `parseError()`. Surfaces
 * the structured `message`, falls back to `why` / `fix` for the description,
 * and adds a "Learn more" action when the error has a `link`.
 */
export function toastFromError(
  err: unknown,
  opts: ToastErrorOptions = {}
): void {
  const parsed = parseError(err)

  let zodMessage: string | null = null
  if (parsed.message) {
    try {
      const arr = JSON.parse(parsed.message)
      if (Array.isArray(arr) && arr.length > 0 && arr[0].message) {
        zodMessage = arr
          .map((e: { message?: string }) => e.message)
          .filter(Boolean)
          .join(". ")
      }
    } catch {
      /* not JSON */
    }
  }

  const title =
    opts.title ??
    zodMessage ??
    parsed.message ??
    opts.fallbackTitle ??
    "Something went wrong"
  const descParts: string[] = []
  if (parsed.why) descParts.push(parsed.why)
  if (parsed.fix && parsed.fix !== parsed.why) descParts.push(parsed.fix)

  toastManager.add({
    title,
    description: descParts.length > 0 ? descParts.join(" ") : undefined,
    type: "error",
    actionProps: parsed.link
      ? {
          children: "Learn more",
          onClick: () => {
            if (typeof window !== "undefined")
              window.open(parsed.link, "_blank")
          },
        }
      : undefined,
  })
}
