import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs";
import { authClient } from '@tripwire/auth/client';
import { useTRPC } from "#/integrations/trpc/react";
import { Button } from "#/components/ui/button";
import { toastFromError } from "#/lib/toast-error";

export const Route = createFileRoute("/request/$owner/$repo")({
	component: RequestPage,
});

function RequestPage() {
	const { owner, repo } = Route.useParams();
	const [{ kind, u: intendedUser }, setSearch] = useQueryStates({
		kind: parseAsStringEnum(["unblock", "access"] as const).withDefault("unblock"),
		u: parseAsString,
	});
	const trpc = useTRPC();
	const { data: session, isPending } = authClient.useSession();

	const repoFullName = `${owner}/${repo}`;
	const setKind = useCallback(
		(next: "unblock" | "access") => setSearch({ kind: next }),
		[setSearch],
	);
	const [reason, setReason] = useState("");
	const [submitted, setSubmitted] = useState(false);

	const whoamiQuery = useQuery({
		...trpc.requests.whoami.queryOptions(),
		enabled: !!session,
		staleTime: 60 * 1000,
	});
	const currentGhLogin = whoamiQuery.data?.githubLogin ?? null;

	const vouchQuery = useQuery({
		...trpc.vouches.check.queryOptions({ username: currentGhLogin ?? "" }),
		enabled: !!currentGhLogin,
		staleTime: 60 * 1000,
	});
	const mismatch =
		!!intendedUser &&
		!!currentGhLogin &&
		currentGhLogin.toLowerCase() !== intendedUser.toLowerCase();

	const submit = useMutation(
		trpc.requests.submit.mutationOptions({
			onSuccess: () => setSubmitted(true),
			onError: (e) => toastFromError(e, { fallbackTitle: "Submission failed" }),
		}),
	);

	const handleLogin = useCallback(async () => {
		await authClient.signIn.social({
			provider: "github",
			callbackURL: typeof window !== "undefined" ? window.location.href : "/",
		});
	}, []);

	const handleSwitchAccount = useCallback(async () => {
		const returnUrl = typeof window !== "undefined" ? window.location.href : "/";
		await authClient.signOut();
		await authClient.signIn.social({ provider: "github", callbackURL: returnUrl });
	}, []);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			submit.mutate({ repoFullName, kind, reason });
		},
		[submit, repoFullName, kind, reason],
	);

	const canSubmit = useMemo(
		() => reason.trim().length >= 10 && !submit.isPending,
		[reason, submit.isPending],
	);

	return (
		<div className="min-h-screen w-full bg-[#191919] text-white flex justify-center px-4 py-16">
			<div className="w-full max-w-[520px] flex flex-col gap-6">
				<header className="flex flex-col gap-1">
					<h1 className="text-[22px] font-semibold tracking-[-0.02em] m-0">
						Request review
					</h1>
					<p className="text-[13px] text-[#FFFFFF99] m-0">
						{repoFullName}
						{intendedUser ? <> · on behalf of <span className="text-white">@{intendedUser}</span></> : null}
					</p>
				</header>

				{submitted ? (
					<div className="rounded-xl bg-tw-card border border-tw-border-card p-5 flex flex-col gap-2">
						<div className="text-[15px] font-medium">Request submitted</div>
						<p className="text-[13px] text-[#FFFFFF99] m-0">
							The maintainers of {repoFullName} have been notified. You'll see the
							result reflected on GitHub once they review.
						</p>
					</div>
				) : isPending ? (
					<div className="rounded-xl bg-tw-card border border-tw-border-card p-5">
						<div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
					</div>
				) : !session ? (
					<div className="rounded-xl bg-tw-card border border-tw-border-card p-5 flex flex-col gap-3">
						<p className="text-[13px] text-[#FFFFFF99] m-0">
							Sign in with GitHub{intendedUser ? ` as @${intendedUser}` : ""} so the maintainers can verify your identity.
						</p>
						<Button onClick={handleLogin} className="self-start">
							Sign in with GitHub
						</Button>
					</div>
				) : mismatch ? (
					<div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-5 flex flex-col gap-3">
						<div className="text-[14px] font-medium text-amber-200">
							Wrong account
						</div>
						<p className="text-[13px] text-[#FFFFFFCC] m-0">
							This appeal is for <span className="text-white font-medium">@{intendedUser}</span>, but you're signed in as <span className="text-white font-medium">@{currentGhLogin}</span>. Switch to the right account to continue.
						</p>
						<div className="flex items-center gap-2">
							<Button onClick={handleSwitchAccount}>
								Sign in as @{intendedUser}
							</Button>
						</div>
					</div>
				) : (
					{vouchQuery.data?.isVouched && (
						<div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center gap-3">
							<span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
							<div className="text-[13px] text-emerald-200">
								<span className="font-medium text-emerald-100">Globally vouched</span>
								{" "}— you have {vouchQuery.data.vouchCount} vouch{vouchQuery.data.vouchCount !== 1 ? "es" : ""} from Tripwire maintainers. Some repositories may auto-approve your contributions.
							</div>
						</div>
					)}
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<label className="text-[12px] font-medium text-tw-text-secondary">
								Request type
							</label>
							<div className="flex flex-wrap gap-1.5">
								{(["unblock", "access"] as const).map((k) => (
									<Button
										key={k}
										type="button"
										variant="ghost"
										size="xs"
										onClick={() => setKind(k)}
										className={`px-3 py-1.5 text-[12px] border whitespace-nowrap ${
											kind === k
												? "bg-tw-accent/15 text-tw-accent border-tw-accent/30"
												: "bg-transparent text-tw-text-tertiary border-tw-border hover:border-tw-text-tertiary hover:text-tw-text-secondary"
										}`}
									>
										{k === "unblock" ? "Appeal a block" : "Request access"}
									</Button>
								))}
							</div>
							<p className="text-[12px] text-[#FFFFFF73] m-0">
								{kind === "unblock"
									? "Tripwire closed something you posted. Explain the context and the maintainer can lift the block."
									: "Ask the maintainers to vouch for you so your contributions aren't filtered."}
							</p>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-[12px] font-medium text-tw-text-secondary">
								Reason
							</label>
							<textarea
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={6}
								placeholder="Briefly explain what you were trying to do and why it should be allowed."
								className="w-full rounded-lg bg-tw-surface border border-tw-border text-[13px] text-tw-text-primary p-3 outline-none focus:border-tw-accent transition-colors resize-none"
							/>
							<p className="text-[12px] text-[#FFFFFF59] m-0">
								{reason.trim().length}/2000 — minimum 10 characters.
							</p>
						</div>

						<Button type="submit" disabled={!canSubmit} className="self-start">
							{submit.isPending ? "Submitting…" : "Submit request"}
						</Button>
					</form>
				)}
			</div>
		</div>
	);
}
