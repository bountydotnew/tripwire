import { useRef, useState } from "react"
import { useMountEffect } from "./use-mount-effect"
import { createPortal } from "react-dom"
import { getElementContext, freeze, unfreeze } from "react-grab/primitives"
import { getFiberFromHostInstance, getDisplayName, traverseFiber } from "bippy"
import { createLogger } from "@tripwire/logger"
import { useFeedback } from "./context"

const logger = createLogger("feedback")

type HoveredInfo = {
  rect: DOMRect
  componentName: string | null
  tagName: string
} | null

function getComponentName(element: Element): string | null {
  const fiber = getFiberFromHostInstance(element)
  if (!fiber) {
    return null
  }
  let name: string | null = null
  traverseFiber(
    fiber,
    (f) => {
      const displayName = getDisplayName(f)
      if (displayName && !displayName.startsWith("_")) {
        name = displayName
        return true
      }
      return false
    },
    true
  )
  return name
}

async function captureScreenshot(
  target: Element,
  componentName: string | null
): Promise<Blob | null> {
  const overlayEl = document.getElementById("feedback-overlay-layer")
  if (overlayEl) overlayEl.style.display = "none"

  // Hide any open dialogs so they don't appear in the screenshot
  const dialogEls = document.querySelectorAll<HTMLElement>(
    '[data-slot="dialog-backdrop"], [data-slot="dialog-viewport"]'
  )
  for (const el of dialogEls) el.style.display = "none"

  try {
    const selectedRect = target.getBoundingClientRect()
    const highlightLabel = componentName ?? target.tagName.toLowerCase()

    const html2canvas = (await import("html2canvas-pro")).default
    const canvas = await html2canvas(document.body, {
      logging: false,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      onclone: (clonedDoc) => {
        for (const el of clonedDoc.querySelectorAll<HTMLElement>(
          '[data-privacy="masked"]'
        )) {
          el.style.filter = "blur(10px)"
        }

        const highlight = clonedDoc.createElement("div")
        Object.assign(highlight.style, {
          position: "fixed",
          top: `${selectedRect.top}px`,
          left: `${selectedRect.left}px`,
          width: `${selectedRect.width}px`,
          height: `${selectedRect.height}px`,
          border: "2px solid #34a6ff",
          backgroundColor: "rgba(52, 166, 255, 0.08)",
          borderRadius: "3px",
          zIndex: "999999",
          pointerEvents: "none",
        })
        clonedDoc.body.appendChild(highlight)

        const label = clonedDoc.createElement("div")
        Object.assign(label.style, {
          position: "fixed",
          top: `${Math.max(selectedRect.top - 24, 4)}px`,
          left: `${selectedRect.left}px`,
          backgroundColor: "#34a6ff",
          color: "#ffffff",
          fontSize: "11px",
          fontFamily: "ui-monospace, monospace",
          fontWeight: "500",
          padding: "2px 6px",
          borderRadius: "3px",
          zIndex: "999999",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        })
        label.textContent = highlightLabel
        clonedDoc.body.appendChild(label)
      },
    })

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/png"
      )
    )
  } catch {
    return null
  } finally {
    if (overlayEl) overlayEl.style.display = ""
    for (const el of dialogEls) el.style.display = ""
  }
}

export function FeedbackOverlay() {
  const { isSelecting, selectElement, setScreenshot, cancelSelection, config } =
    useFeedback()
  const overlayZIndex = config.ui?.zIndex ? config.ui.zIndex - 2 : 9998
  const [hovered, setHovered] = useState<HoveredInfo>(null)
  const [isResolving, setIsResolving] = useState(false)
  const highlightRef = useRef<HTMLDivElement>(null)
  const cancelledRef = useRef(false)

  const isResolvingRef = useRef(isResolving)
  isResolvingRef.current = isResolving
  const isSelectingRef = useRef(isSelecting)
  isSelectingRef.current = isSelecting
  const selectElementRef = useRef(selectElement)
  selectElementRef.current = selectElement
  const setScreenshotRef = useRef(setScreenshot)
  setScreenshotRef.current = setScreenshot
  const cancelSelectionRef = useRef(cancelSelection)
  cancelSelectionRef.current = cancelSelection

  useMountEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResolvingRef.current) {
        return
      }

      if (highlightRef.current) {
        highlightRef.current.style.display = "none"
      }
      const overlay = document.getElementById("feedback-overlay-layer")
      if (overlay) {
        overlay.style.pointerEvents = "none"
      }

      const target = document.elementFromPoint(e.clientX, e.clientY)

      if (overlay) {
        overlay.style.pointerEvents = "auto"
      }
      if (highlightRef.current) {
        highlightRef.current.style.display = ""
      }

      if (
        target &&
        target !== document.body &&
        !target.hasAttribute("data-feedback-ignore")
      ) {
        setHovered({
          rect: target.getBoundingClientRect(),
          componentName: getComponentName(target),
          tagName: target.tagName.toLowerCase(),
        })
      } else {
        setHovered(null)
      }
    }

    const handleClick = async (e: MouseEvent) => {
      if (!isSelectingRef.current || isResolvingRef.current) {
        return
      }
      e.preventDefault()
      e.stopPropagation()

      if (highlightRef.current) {
        highlightRef.current.style.display = "none"
      }
      const overlay = document.getElementById("feedback-overlay-layer")
      if (overlay) {
        overlay.style.pointerEvents = "none"
      }

      const target = document.elementFromPoint(e.clientX, e.clientY)
      if (overlay) {
        overlay.style.pointerEvents = "auto"
      }
      if (!target) {
        return
      }

      setIsResolving(true)
      cancelledRef.current = false

      const componentName = getComponentName(target)

      try {
        // Resolve element context first (fast) and open dialog immediately
        freeze()
        const context = await getElementContext(target)
        if (cancelledRef.current) {
          unfreeze()
          return
        }
        unfreeze()

        // Open dialog right away — no waiting for screenshot
        selectElementRef.current(context, null)
        setIsResolving(false)

        // Capture screenshot in background, then update the blob
        captureScreenshot(target, componentName).then((blob) => {
          if (blob && !cancelledRef.current) {
            setScreenshotRef.current(blob)
          }
        })
      } catch (err) {
        unfreeze()
        setIsResolving(false)
        if (!cancelledRef.current) {
          logger.error("Failed to resolve element context", err)
          cancelSelectionRef.current()
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isResolvingRef.current) {
          cancelledRef.current = true
          unfreeze()
        }
        cancelSelectionRef.current()
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("click", handleClick, true)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("click", handleClick, true)
      window.removeEventListener("keydown", handleKeyDown)
    }
  })

  if (!isSelecting) {
    return null
  }

  return createPortal(
    <div
      id="feedback-overlay-layer"
      className="fixed inset-0 cursor-crosshair bg-black/10"
      style={{ zIndex: overlayZIndex }}
    >
      <div className="animate-in fade-in slide-in-from-top-4 absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-tw-border bg-tw-surface px-4 py-2 text-sm font-medium text-tw-text-primary shadow-lg">
        {isResolving
          ? "Resolving component..."
          : "Click an element to select it \u00b7 Press Esc to cancel"}
      </div>

      {hovered && (
        <div
          ref={highlightRef}
          className="pointer-events-none fixed rounded-sm border-2 border-tw-accent bg-tw-accent/10 transition-all duration-75 ease-out"
          style={{
            top: hovered.rect.top,
            left: hovered.rect.left,
            width: hovered.rect.width,
            height: hovered.rect.height,
          }}
        >
          <div className="absolute -top-6 left-0 flex items-center gap-1 rounded-sm bg-tw-accent px-2 py-0.5 text-xs whitespace-nowrap text-white">
            {hovered.componentName ? (
              <>
                <span className="font-medium">{hovered.componentName}</span>
                <span className="font-mono opacity-60">{hovered.tagName}</span>
              </>
            ) : (
              <span className="font-mono">{hovered.tagName}</span>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
