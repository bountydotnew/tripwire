import { useLayoutEffect, useRef, useState } from "react"

const INLINE_INPUT_MIN_PX = 128
const INLINE_OVERFLOW_MARGIN_PX = 8
const INLINE_INPUT_CHIP_GAP_PX = 6
const REVERT_MARGIN_PX = 10

export function useMentionChipAttachmentBelow(options: {
  mentionCount: number
  textForMeasure: string
}) {
  const [mentionsAttachBelow, setMentionsAttachBelow] = useState(false)
  const composerSurfaceRef = useRef<HTMLDivElement>(null)
  const inlineComposeRef = useRef<HTMLDivElement>(null)
  const chipAttachmentStripRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (options.mentionCount === 0) setMentionsAttachBelow(false)
  }, [options.mentionCount])

  useLayoutEffect(() => {
    if (options.mentionCount === 0) return
    if (mentionsAttachBelow) return

    const surface = composerSurfaceRef.current
    const row = inlineComposeRef.current
    if (!surface || !row) return

    function checkOverflow() {
      const s = composerSurfaceRef.current
      const r = inlineComposeRef.current
      if (!s || !r) return
      const over = r.scrollWidth > s.clientWidth + INLINE_OVERFLOW_MARGIN_PX
      setMentionsAttachBelow(over)
    }

    checkOverflow()
    const ro = new ResizeObserver(checkOverflow)
    ro.observe(surface)
    ro.observe(row)
    window.addEventListener("resize", checkOverflow)

    return () => {
      window.removeEventListener("resize", checkOverflow)
      ro.disconnect()
    }
  }, [mentionsAttachBelow, options.mentionCount, options.textForMeasure])

  useLayoutEffect(() => {
    if (options.mentionCount === 0) return
    if (!mentionsAttachBelow) return

    const surf = composerSurfaceRef.current
    const strip = chipAttachmentStripRef.current
    if (!surf || !strip) return

    function checkRevert() {
      const s = composerSurfaceRef.current
      const st = chipAttachmentStripRef.current
      if (!s || !st) return
      const w = s.clientWidth
      const chipsTotal = st.scrollWidth
      const fits =
        w >
        chipsTotal +
          INLINE_INPUT_MIN_PX +
          INLINE_INPUT_CHIP_GAP_PX +
          REVERT_MARGIN_PX

      if (fits) setMentionsAttachBelow(false)
    }

    checkRevert()
    const ro = new ResizeObserver(checkRevert)
    ro.observe(surf)
    ro.observe(strip)
    window.addEventListener("resize", checkRevert)

    return () => {
      window.removeEventListener("resize", checkRevert)
      ro.disconnect()
    }
  }, [mentionsAttachBelow, options.mentionCount, options.textForMeasure])

  return {
    mentionsAttachBelow,
    composerSurfaceRef,
    inlineComposeRef,
    chipAttachmentStripRef,
  }
}
