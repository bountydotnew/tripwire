import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient } from "@tripwire/auth/client";
import { LandingHeader } from "#/components/landing/header";
import FaultyTerminal from "#/components/landing/faulty-terminal";
import {
	TRIPWIRE_EYE_OUTER_PATH,
	TRIPWIRE_EYE_OUTER_VIEWBOX,
	TRIPWIRE_EYE_SOCKET_PATH,
	TRIPWIRE_EYE_SOCKET_VIEWBOX,
	TRIPWIRE_EYE_SOCKET_RECT_IN_OUTER,
	TRIPWIRE_EYE_PUPIL_PATH,
	TRIPWIRE_EYE_PUPIL_VIEWBOX,
	TRIPWIRE_EYE_PUPIL_RECT_IN_OUTER,
} from "#/components/landing/tripwire-eye";

const EYE_CURSOR_MASK = {
	viewBox: TRIPWIRE_EYE_OUTER_VIEWBOX,
	width: 1.05,
	layers: [
		{
			path: TRIPWIRE_EYE_OUTER_PATH,
			viewBox: TRIPWIRE_EYE_OUTER_VIEWBOX,
			rect: [0, 0, TRIPWIRE_EYE_OUTER_VIEWBOX[0], TRIPWIRE_EYE_OUTER_VIEWBOX[1]] as const,
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
};

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	const { data: session } = authClient.useSession();

	return (
		<div className="[font-synthesis:none] flex w-full min-h-screen flex-col items-center justify-center bg-black antialiased relative overflow-hidden">
			{/* Terminal background */}
			<div className="absolute inset-0 z-0">
				<FaultyTerminal
					scale={3.0}
					digitSize={1.2}
					scanlineIntensity={0.5}
					glitchAmount={5}
					flickerAmount={1}
					noiseAmp={1}
					chromaticAberration={0}
					dither={0}
					curvature={0.05}
					tint="#A7EF9E"
					mouseReact
					mouseStrength={0.5}
					cursorMask={EYE_CURSOR_MASK}
					brightness={0.3}
				/>
			</div>

			{/* Content */}
			<div className="relative z-10 flex w-full md:max-w-[95vw] w-full min-h-screen flex-col">
				<LandingHeader session={session} />
				<div className="flex w-full flex-1 gap-3 justify-center items-center flex-col px-4">
					<h1 className="text-tw-text-primary font-sans font-medium text-lg">
						catch slop before it catches up with you
					</h1>
					{session ? (
						<>
							<Link
								to="/home"
								className="flex items-center h-7 px-2.5 rounded-lg text-[14px] font-medium text-black bg-white shadow-sm hover:bg-white/90 transition-colors"
							>
								get started
							</Link>
						</>
					) : (
						<>
							<Link
								to="/login"
								className="flex items-center h-7 px-2.5 rounded-lg text-[14px] font-medium text-black bg-white shadow-sm hover:bg-white/90 transition-colors"
							>
								login
							</Link>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
