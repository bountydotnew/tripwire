import { useEffect, useRef, useState, useCallback } from "react"

export const TRIPWIRE_EYE_OUTER_PATH =
  "M214.86,35.9c-10.64,3.42-45.97,16.91-58.32,15.58-5.89-.76-7.22-4.18-5.7-10.45,2.85-10.26,12.16-23.74,21.85-39.32.57-.76.38-1.71-.95-1.71h-2.85c-.57,0-.95.38-1.33.95-6.84,8.36-28.31,35.14-39.51,38.18-6.46,1.9-15.01,3.04-17.67-37.8h-5.13c-1.33,19.56-3.8,38.56-13.3,38.56s-24.7-17.28-36.47-30.58L47.87.38c-.19-.38-.57-.38-.95-.38h-3.61c-.95,0-1.14.95-.57,1.71,9.88,15.96,22.61,33.05,22.61,43.12,1.14,14.44-26.6,4.75-58.51-6.65l-5.89-2.47c-.38-.19-.95,0-.95.57v4.18c0,.57.19.95.76,1.14,5.89,3.04,40.84,18.42,40.65,27.92-.38,7.22-19.19,9.12-40.46,11.4-.57,0-.95.57-.95,1.14v5.32c0,.76.57,1.33,1.14,1.33,11.97.76,40.08,2.47,40.08,10.26,0,7.03-21.09,17.47-40.65,27.54-.38.19-.57.57-.57,1.33v4.75c0,.95,1.52.57,2.09.38,12.16-4.56,43.31-16.53,56.23-16.53s8.36,11.97.95,25.45c-5.51,9.5-10.83,17.85-16.72,25.83-.38.95-.19,2.09.76,2.09h3.61c.38,0,.95-.38,1.14-.57,6.46-8.55,29.26-36.66,41.03-39.89,11.59-3.23,13.3,14.63,15.39,39.32,0,.76.57,1.33,1.14,1.33h3.42c.76,0,1.33-.57,1.33-1.33,1.71-23.93,5.51-39.7,13.3-39.7,8.93,0,19.57,11.4,34,27.35l10.07,12.35c.19.76.95,1.14,1.71,1.14h2.28c1.33,0,1.71-1.14.95-2.09-8.36-11.78-23.18-34.38-22.99-45.02,0-7.03,7.79-7.98,26.03-3.61,10.83,2.66,25.84,7.6,38.75,13.49.76.38,1.52.76,1.52-.38v-3.8c0-.57-.38-1.33-.76-1.33-11.02-4.75-41.6-19.18-41.6-27.73,0-6.65,20.33-8.55,41.22-10.64.57,0,1.14-.57,1.14-1.14v-5.32c0-.76-.57-1.33-1.14-1.33-13.11-.76-41.22-2.47-41.22-9.88s20.52-17.86,41.79-29.44c.57-.19.57-.57.57-1.14v-3.8c0-.57-.57-1.14-1.14-.76Z"
export const TRIPWIRE_EYE_OUTER_VIEWBOX: readonly [number, number] = [216, 170]

export const TRIPWIRE_EYE_SOCKET_PATH =
  "M98.16,29.44c-9.88,10.45-24.51,21.27-48.25,21.27-20.52,0-35.71-9.31-48.25-21.27-1.71-1.71-2.66-4.37,0-7.22C11.73,11.97,26.35.19,49.34,0c19.38-.19,34.39,7.98,48.82,21.46,2.66,2.28,2.28,6.08,0,7.98Z"
export const TRIPWIRE_EYE_SOCKET_VIEWBOX: readonly [number, number] = [
  100.02, 50.72,
]

export const TRIPWIRE_EYE_PUPIL_PATH =
  "M15.2,0C7.79.19,0,5.32,0,15.38c0,7.6,5.7,15.58,15.58,15.58,8.93,0,15.01-6.46,15.01-15.2S24.32.19,15.2,0Z"
export const TRIPWIRE_EYE_PUPIL_VIEWBOX: readonly [number, number] = [
  30.59, 30.96,
]

// All four numbers are in outer-viewBox units (216 ├ù 170).
// Derived from the pixel-space layout in TripwireEye at scale = 1:
//   px ΓåÆ outer-viewBox conversion factor: 216 / 595 Γëê 0.36303
// Socket pixel rect:  (159.5, 163.8, 275, 139.5)
// Pupil  pixel rect:  (262,   198.55, 70, 70.85)   (70.85 from 70 ├ù 30.96/30.59)
export const TRIPWIRE_EYE_SOCKET_RECT_IN_OUTER: readonly [
  number,
  number,
  number,
  number,
] = [57.89, 59.46, 99.83, 50.65]
export const TRIPWIRE_EYE_PUPIL_RECT_IN_OUTER: readonly [
  number,
  number,
  number,
  number,
] = [95.09, 72.07, 25.41, 25.72]

export function TripwireEye({ size = 595 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })
  const currentRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)

  const MAX_OFFSET = 45

  const scale = size / 595
  const pupilSize = 70 * scale
  const eyeLeft = 159.5 * scale
  const eyeTop = 163.8 * scale
  const eyeWidth = 275 * scale
  const eyeHeight = 139.5 * scale
  const pupilRestLeft = (eyeWidth - pupilSize) / 2
  const pupilRestTop = (eyeHeight - pupilSize) / 2

  const animate = useCallback(() => {
    const current = currentRef.current
    const target = targetRef.current
    const damping = 0.06

    current.x += (target.x - current.x) * damping
    current.y += (target.y - current.y) * damping

    setPupilOffset({ x: current.x, y: current.y })
    rafRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [animate])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const dx = e.clientX - centerX
      const dy = e.clientY - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = Math.max(rect.width, rect.height) * 0.6

      const normalizedScale = Math.min(dist / maxDist, 1)
      const angle = Math.atan2(dy, dx)

      targetRef.current = {
        x: Math.cos(angle) * normalizedScale * MAX_OFFSET * scale,
        y: Math.sin(angle) * normalizedScale * MAX_OFFSET * scale,
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [scale])

  const containerHeight = (468 / 595) * size

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ width: size, height: containerHeight }}
    >
      {/* Shape (outer spiky form) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 216 170"
        fill="#202023"
        style={{
          width: size,
          height: "auto",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <path d={TRIPWIRE_EYE_OUTER_PATH} />
      </svg>

      {/* Eye socket ΓÇö clips the pupil */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: eyeLeft,
          top: eyeTop,
          width: eyeWidth,
          height: eyeHeight,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${TRIPWIRE_EYE_SOCKET_VIEWBOX[0]} ${TRIPWIRE_EYE_SOCKET_VIEWBOX[1]}`}
          style={{
            width: eyeWidth,
            height: "auto",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <path d={TRIPWIRE_EYE_SOCKET_PATH} fill="#191919" />
        </svg>

        {/* Pupil ΓÇö follows mouse */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${TRIPWIRE_EYE_PUPIL_VIEWBOX[0]} ${TRIPWIRE_EYE_PUPIL_VIEWBOX[1]}`}
          fill="#202023"
          style={{
            width: pupilSize,
            height: "auto",
            position: "absolute",
            left: pupilRestLeft + pupilOffset.x,
            top: pupilRestTop + pupilOffset.y,
          }}
        >
          <path d={TRIPWIRE_EYE_PUPIL_PATH} />
        </svg>
      </div>
    </div>
  )
}
