import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseAsString, useQueryStates } from "nuqs";
import { authClient } from '@tripwire/auth/client';
import { Button } from "#/components/ui/button";
import { TripwireSparkIcon } from "#/components/icons/nav-icons";

export const Route = createFileRoute("/oauth/consent")({
	component: ConsentPage,
});

function ConsentPage() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();
	const [{ consent_code, client_id, scope }] = useQueryStates({
		consent_code: parseAsString,
		client_id: parseAsString,
		scope: parseAsString,
	});

	const [state, setState] = useState<"idle" | "submitting" | "success" | "denied" | "error">("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [appName, setAppName] = useState<string | null>(null);

	useEffect(() => {
		if (!client_id) return;
		let cancelled = false;
		fetch(`/api/oauth/app-info?client_id=${encodeURIComponent(client_id)}`, {
			credentials: "include",
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (cancelled) return;
				if (data && typeof data.name === "string") setAppName(data.name);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [client_id]);

	if (!isPending && !session) {
		navigate({
			to: "/login",
			search: { redirect: window.location.pathname + window.location.search },
		});
		return null;
	}

	const scopes = (scope ?? "").split(" ").filter(Boolean);
	const clientName = appName ?? "An application";

	async function submit(accept: boolean) {
		if (!consent_code) {
			setErrorMessage("Missing consent code — this link is invalid or expired.");
			setState("error");
			return;
		}
		setState("submitting");
		try {
			const res = await fetch("/api/auth/oauth2/consent", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ accept, consent_code }),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(`Consent endpoint returned ${res.status}: ${body}`);
			}
			const { redirectURI } = (await res.json()) as { redirectURI: string };
			setState(accept ? "success" : "denied");
			window.setTimeout(() => {
				window.location.href = redirectURI;
			}, 900);
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
			setState("error");
		}
	}

	if (isPending) {
		return <Centered><Spinner /></Centered>;
	}

	if (state === "success") {
		return (
			<Centered>
				<TripwireLogo accent />
				<div className="flex flex-col items-center gap-2">
					<div className="flex items-center gap-2 text-[15px] text-white">
						<CheckRing /> Connected to {clientName}
					</div>
					<div className="text-[13px] text-tw-text-tertiary">
						Returning you to {clientName}…
					</div>
				</div>
			</Centered>
		);
	}

	if (state === "denied") {
		return (
			<Centered>
				<TripwireLogo />
				<div className="text-[15px] text-tw-text-secondary">
					Access denied. Returning to {clientName}…
				</div>
			</Centered>
		);
	}

	if (state === "error") {
		return (
			<Centered>
				<TripwireLogo />
				<div className="text-[15px] text-tw-text-secondary">
					{errorMessage ?? "Something went wrong."}
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => navigate({ to: "/" })}
					className="bg-white text-black border-[#CDCDCD] hover:bg-white/90"
				>
					Back to Tripwire
				</Button>
			</Centered>
		);
	}

	return (
		<Centered>
			<TripwireLogo />
			<div className="flex flex-col items-center gap-2 max-w-md text-center">
				<h1 className="text-[20px] leading-7 text-white font-medium">
					Allow {clientName} to access your Tripwire account?
				</h1>
				<p className="text-[13px] leading-5 text-tw-text-secondary">
					Signed in as <span className="text-white">{session?.user?.name ?? session?.user?.email}</span>.{" "}
					{clientName} will be able to use the tools below on your behalf.
				</p>
			</div>
			{scopes.length > 0 && (
				<ul className="flex flex-col gap-1 text-[13px] text-tw-text-secondary bg-tw-inner rounded-[10px] px-4 py-3 min-w-[280px]">
					{scopes.map((s) => (
						<li key={s} className="flex items-center gap-2">
							<Dot /> {humanScope(s)}
						</li>
					))}
				</ul>
			)}
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => submit(false)}
					disabled={state !== "idle"}
					className="bg-transparent text-tw-text-secondary border-[#2A2A2A] hover:bg-tw-card hover:text-white"
				>
					Deny
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => submit(true)}
					disabled={state !== "idle"}
					className="bg-white text-black border-[#CDCDCD] hover:bg-white/90"
				>
					Allow
				</Button>
			</div>
		</Centered>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="[font-synthesis:none] flex w-full h-screen justify-center items-center gap-8 flex-col bg-[#191919] shrink-0 antialiased">
			{children}
		</div>
	);
}

function TripwireLogo({ accent }: { accent?: boolean }) {
	return (
		<div
			className={accent ? "text-white" : "text-tw-text-secondary"}
			style={{ transition: "color 200ms ease" }}
		>
			<TripwireSparkIcon className="!w-16 !h-16" />
		</div>
	);
}

function Spinner() {
	return <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />;
}

function Dot() {
	return <span className="w-1.5 h-1.5 rounded-full bg-tw-text-tertiary shrink-0" />;
}

function CheckRing() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
			<circle cx="12" cy="12" r="10" stroke="#67E19F" strokeWidth="1.8" />
			<path
				d="M8 12.5L11 15.5L16 9.5"
				stroke="#67E19F"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function humanScope(scope: string): string {
	const map: Record<string, string> = {
		openid: "Sign in as your Tripwire user",
		profile: "Read your name and avatar",
		email: "Read your email address",
		offline_access: "Stay connected while you're away",
	};
	return map[scope] ?? scope;
}
