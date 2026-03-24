import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "#/integrations/trpc/react";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
	const [errorMessage, setErrorMessage] = useState("");
	const trpc = useTRPC();
	const { data: session } = authClient.useSession();

	const joinWaitlist = useMutation(
		trpc.waitlist.join.mutationOptions({
			onSuccess: () => {
				setStatus("success");
				setEmail("");
			},
			onError: (err) => {
				setStatus("error");
				setErrorMessage(err.message);
			},
		}),
	);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email) return;
		setStatus("idle");
		joinWaitlist.mutate({ email });
	}

	return (
		<div className="[font-synthesis:none] flex w-full min-h-screen justify-center items-center flex-col gap-10 bg-[#191919] antialiased px-4">
			{/* Logo in corner */}
			<svg
				fill="none"
				stroke="#FFFFFF26"
				strokeWidth="21.37"
				viewBox="0 0 153 179"
				xmlns="http://www.w3.org/2000/svg"
				className="absolute bottom-8 right-8 w-6 h-7 opacity-50"
			>
				<path
					d="M91.138 71.11C107.031 77.947 125.457 70.606 132.294 54.714C139.132 38.822 131.791 20.396 115.899 13.558C100.006 6.721 81.58 14.061 74.743 29.954C67.906 45.846 75.246 64.272 91.138 71.11ZM91.138 71.11L29.921 44.772M5 102.256L33.998 114.732C49.891 121.57 68.317 114.229 75.154 98.337C81.992 82.444 74.651 64.018 58.759 57.181L29.76 44.705M148.655 95.857L119.657 83.381C103.764 76.543 85.338 83.884 78.501 99.776L78.518 179"
					fill="none"
					stroke="#FFFFFF26"
				/>
			</svg>

			{/* Header */}
			<h1 className="text-white font-['Instrument_Sans',system-ui,sans-serif] font-semibold text-xl">
				tripwire
			</h1>

			{/* Content */}
			<div className="flex flex-col items-center gap-4 max-w-xs w-full">
				<p className="text-white font-medium text-base text-center">
					catch slop before it catches up with you
				</p>

				{status === "success" ? (
					<div className="text-tw-success text-sm text-center">
						You're on the list!
					</div>
				) : (
					<form onSubmit={handleSubmit} className="flex justify-center items-start w-full gap-1.5">
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="enter email"
							className="h-7 w-full rounded-[10px] px-2 bg-white/[0.026] border border-white/[0.08] text-white text-sm placeholder:text-[#999999] focus:outline-none focus:border-white/20"
						/>
						<button
							type="submit"
							disabled={joinWaitlist.isPending}
							className="h-7 shrink-0 rounded-[10px] px-2.5 bg-white border border-[#CDCDCD] text-black text-sm font-medium cursor-pointer disabled:opacity-50"
						>
							{joinWaitlist.isPending ? "..." : "join waitlist"}
						</button>
					</form>
				)}

				{status === "error" && (
					<div className="text-red-400 text-sm text-center">
						{errorMessage}
					</div>
				)}
			</div>

			{/* Login link for existing users */}
			{session ? (
				<Link
					to="/rules"
					className="text-tw-text-secondary text-sm hover:text-white transition-colors"
				>
					Go to dashboard
				</Link>
			) : (
				<Link
					to="/login"
					className="text-tw-text-secondary text-sm hover:text-white transition-colors"
				>
					Already have access? Log in
				</Link>
			)}
		</div>
	);
}
