import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { authClient } from "#/lib/auth-client";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();

	// Redirect to /rules if already logged in
	useEffect(() => {
		if (!isPending && session) {
			navigate({ to: "/rules" });
		}
	}, [session, isPending, navigate]);

	async function handleLogin() {
		await authClient.signIn.social({
			provider: "github",
			callbackURL: "/rules",
		});
	}

	if (isPending) {
		return (
			<div className="flex w-full h-screen justify-center items-center bg-[#191919]">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
			</div>
		);
	}

	return (
		<div className="[font-synthesis:none] flex w-full h-screen justify-center items-center gap-10 flex-col bg-[#191919] shrink-0 antialiased px-0">
			<svg
				fill="none"
				stroke="#FFFFFF26"
				strokeWidth="21.37"
				viewBox="0 0 153 179"
				xmlns="http://www.w3.org/2000/svg"
				color="#FFFFFF26"
				width="153"
				height="179"
				style={{
					display: "block",
					height: "118px",
					verticalAlign: "middle",
					width: "100px",
					overflow: "clip",
					flexShrink: "0",
				}}
			>
				<path
					d="M91.138 71.11C107.031 77.947 125.457 70.606 132.294 54.714C139.132 38.822 131.791 20.396 115.899 13.558C100.006 6.721 81.58 14.061 74.743 29.954C67.906 45.846 75.246 64.272 91.138 71.11ZM91.138 71.11L29.921 44.772M5 102.256L33.998 114.732C49.891 121.57 68.317 114.229 75.154 98.337C81.992 82.444 74.651 64.018 58.759 57.181L29.76 44.705M148.655 95.857L119.657 83.381C103.764 76.543 85.338 83.884 78.501 99.776L78.518 179"
					color="#FFFFFF26"
					fill="none"
					stroke="#FFFFFF26"
				/>
			</svg>
			<button
				type="button"
				onClick={handleLogin}
				className="items-center flex shrink-0 h-7 justify-center rounded-[10px] px-2.5 gap-2 relative bg-white border border-solid border-[#CDCDCD] cursor-pointer"
			>
				<span className="text-sm text-center leading-[round(up,142.857%,1px)] text-black font-['Geist','system-ui',sans-serif] font-medium shrink-0">
					Log in
				</span>
				<div className="left-0 absolute right-[0.938px] rounded-[9px] [box-shadow:#00000000_0px_0px_0px,#00000000_0px_0px_0px,#00000000_0px_0px_0px,#00000000_0px_0px_0px,oklab(100%_0_0/6%)_0px_-1px_0px] inset-y-0" />
			</button>
		</div>
	);
}
