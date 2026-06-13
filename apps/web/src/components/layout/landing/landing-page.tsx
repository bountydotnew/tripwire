import { Link } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { authClient } from "@tripwire/auth/client"
import {
  TRIPWIRE_EYE_OUTER_PATH,
  TRIPWIRE_EYE_OUTER_VIEWBOX,
  TRIPWIRE_EYE_PUPIL_PATH,
  TRIPWIRE_EYE_PUPIL_RECT_IN_OUTER,
  TRIPWIRE_EYE_PUPIL_VIEWBOX,
  TRIPWIRE_EYE_SOCKET_PATH,
  TRIPWIRE_EYE_SOCKET_RECT_IN_OUTER,
  TRIPWIRE_EYE_SOCKET_VIEWBOX,
} from "@tripwire/ui/icons/tripwire-eye"
import { LandingHeader } from "./header"
import FaultyTerminal from "./faulty-terminal"
import { useSpaceInvaders } from "./space-invaders"

const EYE_CURSOR_MASK = {
  viewBox: TRIPWIRE_EYE_OUTER_VIEWBOX,
  width: 1.05,
  layers: [
    {
      path: TRIPWIRE_EYE_OUTER_PATH,
      viewBox: TRIPWIRE_EYE_OUTER_VIEWBOX,
      rect: [
        0,
        0,
        TRIPWIRE_EYE_OUTER_VIEWBOX[0],
        TRIPWIRE_EYE_OUTER_VIEWBOX[1],
      ] as const,
      mode: "add" as const,
    },
    {
      path: TRIPWIRE_EYE_SOCKET_PATH,
      viewBox: TRIPWIRE_EYE_SOCKET_VIEWBOX,
      rect: TRIPWIRE_EYE_SOCKET_RECT_IN_OUTER,
      mode: "subtract" as const,
    },
    {
      path: TRIPWIRE_EYE_PUPIL_PATH,
      viewBox: TRIPWIRE_EYE_PUPIL_VIEWBOX,
      rect: TRIPWIRE_EYE_PUPIL_RECT_IN_OUTER,
      mode: "add" as const,
    },
  ],
}

export function LandingPage() {
  const { data: session } = authClient.useSession()
  const [gameActive, setGameActive] = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  const exitGame = useCallback(() => {
    setGameActive(false)
    setTransitioning(false)
  }, [])

  const gameCanvas = useSpaceInvaders(gameActive, exitGame)

  useEffect(() => {
    if (gameActive || transitioning) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) {
        setTransitioning(true)
        setTimeout(() => setGameActive(true), 600)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [gameActive, transitioning])

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-tw-bg antialiased [font-synthesis:none]">
      {/* Terminal — the game renders INSIDE it via the gameCanvas texture */}
      <div className="absolute inset-0 z-0">
        <FaultyTerminal
          scale={3.0}
          digitSize={1.2}
          scanlineIntensity={0.5}
          glitchAmount={transitioning ? 30 : 5}
          flickerAmount={1}
          noiseAmp={gameActive ? 0.4 : 1}
          chromaticAberration={transitioning ? 5 : 0}
          dither={0}
          curvature={0.05}
          tint="#A7EF9E"
          mouseReact={!gameActive}
          mouseStrength={0.5}
          cursorMask={EYE_CURSOR_MASK}
          brightness={gameActive ? 0.5 : 0.3}
          gameCanvas={gameCanvas}
          gameMix={gameActive ? 1 : 0}
        />
      </div>

      {/* Landing content — fades out when game activates */}
      <div
        className="relative z-10 flex min-h-screen w-full flex-col transition-all duration-500 md:max-w-[95vw]"
        style={{
          opacity: transitioning || gameActive ? 0 : 1,
          transform: transitioning ? "scale(0.96)" : "scale(1)",
          filter: transitioning ? "blur(12px) brightness(2)" : "none",
          pointerEvents: gameActive ? "none" : "auto",
        }}
      >
        <LandingHeader session={session} />
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 px-4">
          <h1 className="font-sans text-lg font-medium text-tw-text-primary">
            catch slop before it catches up with you
          </h1>
          {session ? (
            <GetStartedLink />
          ) : (
            <Link
              to="/login"
              className="flex h-7 items-center rounded-lg bg-white px-2.5 text-[14px] font-medium text-black shadow-sm transition-colors hover:bg-white/90"
            >
              login
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Landing-page CTA. Reads the user's orgs and links to their first
 * org's home. Falls back to `/onboarding` when the user has no org
 * yet (a brief race window after signup before the `user.create` auth
 * hook finished creating their personal workspace).
 */
function GetStartedLink() {
  const { data: orgs } = authClient.useListOrganizations()
  const firstSlug = orgs?.[0]?.slug
  if (firstSlug) {
    return (
      <Link
        to="/$orgHandle/home"
        params={{ orgHandle: firstSlug }}
        className="flex h-7 items-center rounded-lg bg-white px-2.5 text-[14px] font-medium text-black shadow-sm transition-colors hover:bg-white/90"
      >
        get started
      </Link>
    )
  }
  return (
    <Link
      to="/onboarding"
      className="flex h-7 items-center rounded-lg bg-white px-2.5 text-[14px] font-medium text-black shadow-sm transition-colors hover:bg-white/90"
    >
      get started
    </Link>
  )
}
