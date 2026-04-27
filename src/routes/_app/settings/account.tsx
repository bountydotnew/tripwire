import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "#/lib/auth-context";
import { authClient } from "#/lib/auth-client";
import {
	Dialog,
	DialogTrigger,
	DialogPopup,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogPanel,
	DialogFooter,
	DialogClose,
} from "#/components/ui/dialog";

export const Route = createFileRoute("/_app/settings/account")({
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	const { user } = useAuth();
	const navigate = useNavigate();

	const createdAt = (user as { createdAt?: string | Date }).createdAt;
	const joinedDate = createdAt
		? new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
		: null;

	const handleSignOut = async () => {
		await authClient.signOut();
		navigate({ to: "/login" });
	};

	return (
		<div className="flex flex-col gap-8">
			{/* Profile */}
			<SettingsSection title="Profile" description="Your personal info shown across Tripwire.">
				<div className="rounded-xl bg-tw-card p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div
								className="size-10 rounded-full bg-cover bg-center bg-tw-hover shrink-0"
								style={{
									backgroundImage: user.image
										? `url('${user.image}')`
										: undefined,
								}}
							/>
							<div>
								<div className="text-[14px] font-medium text-tw-text-primary">
									{user.name ?? "Unknown"}
								</div>
								<div className="text-[12px] text-tw-text-muted">
									{user.email}
									{joinedDate ? ` · Member since ${joinedDate}` : ""}
								</div>
							</div>
						</div>
					</div>
				</div>
			</SettingsSection>

			{/* Sessions */}
			<SettingsSection title="Sessions" description="Active sessions on this account.">
				<SessionsList />
			</SettingsSection>

			{/* Danger zone */}
			<SettingsSection title="Danger zone" description="Irreversible account actions.">
				<div className="rounded-xl bg-tw-card divide-y divide-[#27272A]">
					<div className="flex items-center justify-between p-4">
						<div>
							<div className="text-[13px] font-medium text-tw-text-primary">
								Sign out everywhere
							</div>
							<div className="text-[12px] text-tw-text-muted mt-0.5">
								End all sessions across all devices.
							</div>
						</div>
						<button
							type="button"
							onClick={handleSignOut}
							className="flex items-center h-8 px-3 rounded-lg border border-[#27272A] text-[13px] font-medium text-tw-text-primary hover:bg-tw-hover transition-colors"
						>
							Sign out
						</button>
					</div>
					<DeleteAccountRow />
				</div>
			</SettingsSection>
		</div>
	);
}

function DeleteAccountRow() {
	const [confirmText, setConfirmText] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const navigate = useNavigate();

	const handleDelete = async () => {
		setIsDeleting(true);
		setDeleteError(null);
		try {
			const res = await authClient.deleteUser();
			if (res.error) {
				setDeleteError(res.error.message ?? "Failed to delete account.");
				setIsDeleting(false);
				return;
			}
			window.location.href = "/login";
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to delete account.";
			setDeleteError(msg);
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex items-center justify-between p-4">
			<div>
				<div className="text-[13px] font-medium text-tw-text-primary">
					Delete account
				</div>
				<div className="text-[12px] text-tw-text-muted mt-0.5">
					Permanently delete your Tripwire account and all associated data.
				</div>
			</div>
			<Dialog onOpenChange={() => { setConfirmText(""); setDeleteError(null); }}>
				<DialogTrigger
					className="flex items-center h-8 px-3 rounded-lg border border-red-500/30 text-[13px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
				>
					Delete
				</DialogTrigger>
				<DialogPopup showCloseButton={false} className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete account</DialogTitle>
						<DialogDescription>
							This will permanently delete your account, repos, rules, and chat history. This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogPanel>
						<div className="flex flex-col gap-3">
							{deleteError && (
								<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[12px] text-red-400">
									{deleteError}
								</div>
							)}
							<div className="flex flex-col gap-1.5">
								<label className="text-[12px] text-tw-text-muted">
									Type <span className="font-mono text-tw-text-secondary">delete</span> to confirm
								</label>
							<input
								type="text"
								value={confirmText}
								onChange={(e) => setConfirmText(e.target.value)}
								placeholder="delete"
								autoComplete="off"
								className="h-9 w-full rounded-lg bg-tw-inner px-2.5 text-[13px] text-tw-text-primary placeholder:text-tw-text-tertiary outline-none border border-[#27272A] focus:border-red-500/50"
							/>
							</div>
						</div>
					</DialogPanel>
					<DialogFooter variant="bare">
						<DialogClose
							className="flex items-center h-8 px-3 rounded-lg border border-[#27272A] text-[13px] font-medium text-tw-text-secondary hover:bg-tw-hover transition-colors"
						>
							Cancel
						</DialogClose>
						<button
							type="button"
							disabled={confirmText !== "delete" || isDeleting}
							onClick={handleDelete}
							className="flex items-center h-8 px-3 rounded-lg bg-red-500 text-[13px] font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{isDeleting ? "Deleting..." : "Delete my account"}
						</button>
					</DialogFooter>
				</DialogPopup>
			</Dialog>
		</div>
	);
}

function SessionsList() {
	const { data: sessions, isPending } = authClient.useListSessions();

	if (isPending) {
		return (
			<div className="rounded-xl bg-tw-card p-4">
				<div className="flex items-center gap-3">
					<div className="size-4 rounded bg-white/5" />
					<div className="h-4 w-32 rounded bg-white/5" />
				</div>
			</div>
		);
	}

	const sessionList = (sessions ?? []) as Array<{ id: string; ipAddress?: string | null }>;

	return (
		<div className="rounded-xl bg-tw-card divide-y divide-[#27272A]">
			{sessionList.length === 0 ? (
				<div className="p-4 text-[13px] text-tw-text-muted">No active sessions.</div>
			) : (
				sessionList.map((session) => (
					<div key={session.id} className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-tw-text-muted shrink-0">
								<rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
								<path d="M5 14h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
							</svg>
							<div>
								<div className="text-[13px] font-medium text-tw-text-primary">
									Session
								</div>
								<div className="text-[12px] text-tw-text-muted">
									{session.ipAddress ?? "Unknown location"}
								</div>
							</div>
						</div>
						<span className="text-[12px] font-medium text-green-400">Active</span>
					</div>
				))
			)}
		</div>
	);
}

function SettingsSection({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div>
				<h2 className="text-[14px] font-semibold text-tw-text-primary">{title}</h2>
				<p className="text-[13px] text-tw-text-muted mt-0.5">{description}</p>
			</div>
			{children}
		</div>
	);
}
