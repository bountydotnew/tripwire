import { Link } from "@tanstack/react-router"
import type { AuthClientSession } from "@tripwire/auth/client"
import { TripwireLogo } from "#/components/icons/tripwire-logo"

// The terminal's barrel curvature makes the top edge of the visible screen bow
// upward in the middle (corners recede). Both side groups translate slightly
// down to sit where the curved screen edge actually is at the corners, and
// rotate outward so each group's baseline aligns with the curve tangent at its
// position. Contents stay crisp because we never touch pixels — only layout.
const SIDE_DROP_PX = 4
const SIDE_TILT_DEG = 1.6

export function LandingHeader({ session }: { session: AuthClientSession }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div
        className="flex items-center gap-2"
        style={{
          transform: `translateY(${SIDE_DROP_PX}px) rotate(-${SIDE_TILT_DEG}deg)`,
          transformOrigin: "right center",
        }}
      >
        <TripwireLogo className="h-5 w-5 text-white" />
        <span className="text-md font-['Geist',system-ui,sans-serif] font-medium text-tw-text-secondary">
          tripwire
        </span>
      </div>
      <div
        className="flex items-center gap-3.5"
        style={{
          transform: `translateY(${SIDE_DROP_PX}px) rotate(${SIDE_TILT_DEG}deg)`,
          transformOrigin: "left center",
        }}
      >
        {session ? (
          <>
            <span className="text-[14px] text-tw-text-secondary">
              Welcome back
            </span>
            <Link
              to="/home"
              className="flex h-7 items-center rounded-lg bg-white px-2.5 text-[14px] font-medium text-black shadow-sm transition-colors hover:bg-white/90"
            >
              dashboard
            </Link>
          </>
        ) : (
          <>
            <span className="text-[14px] text-tw-text-secondary">
              Already have access?
            </span>
            <Link
              to="/login"
              className="flex h-7 items-center rounded-lg bg-white px-2.5 text-[14px] font-medium text-black shadow-sm transition-colors hover:bg-white/90"
            >
              login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
