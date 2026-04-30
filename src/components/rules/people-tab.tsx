import { useState } from "react";
import { toastManager } from "#/components/ui/toast";

interface PeopleUser {
	username: string;
	avatarUrl: string;
	reason?: string | null;
	addedBy?: string | null;
	addedAt?: string | null;
}

interface SuggestedContributor {
	username: string;
	avatarUrl: string;
	contributions: number;
}

interface PeopleTabProps {
	blacklistUsers: PeopleUser[];
	whitelistUsers: PeopleUser[];
	suggestedContributors?: SuggestedContributor[];
	onAddBlacklist: (username: string, reason?: string) => Promise<void>;
	onRemoveBlacklist: (username: string) => void;
	onAddWhitelist: (username: string, reason?: string) => Promise<void>;
	onRemoveWhitelist: (username: string) => void;
	isAddingBlacklist?: boolean;
	isAddingWhitelist?: boolean;
}

export function PeopleTab({
	blacklistUsers,
	whitelistUsers,
	suggestedContributors,
	onAddBlacklist,
	onRemoveBlacklist,
	onAddWhitelist,
	onRemoveWhitelist,
	isAddingBlacklist,
	isAddingWhitelist,
}: PeopleTabProps) {
	const [subtab, setSubtab] = useState<"block" | "allow">("block");
	const [dismissed, setDismissed] = useState(false);
	const [addingAll, setAddingAll] = useState(false);
	const [search, setSearch] = useState("");
	const [username, setUsername] = useState("");
	const [reason, setReason] = useState("");
	const [hasError, setHasError] = useState(false);

	const users = subtab === "block" ? blacklistUsers : whitelistUsers;
	const isAdding = subtab === "block" ? isAddingBlacklist : isAddingWhitelist;
	const q = search.toLowerCase();
	const filtered = q ? users.filter((u) => u.username.toLowerCase().includes(q)) : users;

	const handleAdd = async () => {
		const clean = username.trim().replace(/^@/, "");
		if (!clean) return;
		setHasError(false);
		try {
			if (subtab === "block") {
				await onAddBlacklist(clean, reason.trim() || undefined);
			} else {
				await onAddWhitelist(clean, reason.trim() || undefined);
			}
			setUsername("");
			setReason("");
		} catch (err) {
			setHasError(true);
			toastManager.add({
				title: err instanceof Error ? err.message : "Failed to add user",
				type: "error",
			});
		}
	};

	const handleMove = (user: PeopleUser) => {
		if (subtab === "block") {
			onRemoveBlacklist(user.username);
			onAddWhitelist(user.username).catch(() => {});
		} else {
			onRemoveWhitelist(user.username);
			onAddBlacklist(user.username).catch(() => {});
		}
	};

	const handleRemove = (user: PeopleUser) => {
		if (subtab === "block") {
			onRemoveBlacklist(user.username);
		} else {
			onRemoveWhitelist(user.username);
		}
	};

	const blockColor = "rgb(245, 109, 93)";
	const allowColor = "rgb(93, 209, 122)";
	const activeColor = subtab === "block" ? blockColor : allowColor;

	return (
		<div className="flex flex-col gap-4 min-w-0">
			{/* Header: tabs + search */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-1 bg-tw-card rounded-[10px] p-1">
					<button
						type="button"
						onClick={() => { setSubtab("block"); setSearch(""); }}
						className={`flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors ${
							subtab === "block"
								? "bg-[#FAFAFA1A] text-[#EEEEEE]"
								: "text-[#9F9FA9] hover:text-[#EEEEEE]"
						}`}
					>
						<span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: blockColor }} />
						Always block
						<span className="text-[11px] text-[#6E6E6E] tabular-nums ml-0.5">{blacklistUsers.length}</span>
					</button>
					<button
						type="button"
						onClick={() => { setSubtab("allow"); setSearch(""); }}
						className={`flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors ${
							subtab === "allow"
								? "bg-[#FAFAFA1A] text-[#EEEEEE]"
								: "text-[#9F9FA9] hover:text-[#EEEEEE]"
						}`}
					>
						<span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: allowColor }} />
						Always allow
						<span className="text-[11px] text-[#6E6E6E] tabular-nums ml-0.5">{whitelistUsers.length}</span>
					</button>
				</div>
				<div className="flex items-center gap-2 h-9 w-[200px] rounded-[10px] bg-tw-card px-2.5">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="#9a9a9a" strokeWidth="1.3" /><path d="M10.5 10.5L13.5 13.5" stroke="#9a9a9a" strokeWidth="1.3" strokeLinecap="round" /></svg>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={`Search always ${subtab}`}
						className="flex-1 bg-transparent outline-none text-[13px] text-white placeholder:text-[#6E6E6E]"
					/>
				</div>
			</div>

			{/* Add form */}
			<div className="rounded-[10px] bg-tw-card p-1">
				<div className="flex items-center gap-2 h-9 px-2.5">
					<span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activeColor }} />
					<span className="text-[12px] text-[#6E6E6E] shrink-0">{subtab === "block" ? "Block" : "Allow"}</span>
					<input
						value={username}
						onChange={(e) => { setUsername(e.target.value); if (hasError) setHasError(false); }}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="@username"
						className="flex-1 bg-transparent outline-none text-[13px] text-[#EEEEEE] placeholder:text-[#6E6E6E]"
					/>
					<input
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="Reason (optional)"
						className="w-[180px] bg-transparent outline-none text-[13px] text-[#B4B4B4] placeholder:text-[#6E6E6E] border-l border-[#FAFAFA14] pl-2.5"
					/>
					<button
						type="button"
						disabled={!username.trim() || isAdding}
						onClick={handleAdd}
						className={`h-7 px-2.5 rounded-[6px] text-[12px] font-medium flex items-center gap-1 transition-colors ${
							username.trim()
								? "bg-[#FAFAFA1A] text-[#EEEEEE] hover:bg-[#FAFAFA2A]"
								: "bg-[#FAFAFA14] text-[#6E6E6E] cursor-not-allowed"
						}`}
					>
						<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
						{subtab === "block" ? "Block" : "Allow"}
					</button>
				</div>
			</div>

			{/* Suggestion banner — only on allow tab */}
			{subtab === "allow" && !dismissed && suggestedContributors && suggestedContributors.length > 0 && (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#9F9FA9" strokeWidth="1.2"/><path d="M4 7L6 9L10 5" stroke="#9F9FA9" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
						<span className="text-[13px] text-tw-text-primary">
							We found {suggestedContributors.length} contributor{suggestedContributors.length !== 1 ? "s" : ""} with merged commits to this repo
						</span>
					</div>
					<div className="flex items-center gap-1 pl-[22px]">
						{suggestedContributors.slice(0, 5).map((c) => (
							<img key={c.username} src={c.avatarUrl} alt={c.username} title={`@${c.username} (${c.contributions} commits)`} className="size-6 rounded-full" />
						))}
						{suggestedContributors.length > 5 && (
							<span className="text-[11px] text-tw-text-muted ml-1">+{suggestedContributors.length - 5} more</span>
						)}
					</div>
					<div className="flex items-center gap-2 pl-[22px]">
						<button
							type="button"
							disabled={addingAll}
							onClick={async () => {
								setAddingAll(true);
								try {
									for (const c of suggestedContributors) {
										await onAddWhitelist(c.username, "Existing contributor").catch(() => {});
									}
									setDismissed(true);
								} finally {
									setAddingAll(false);
								}
							}}
							className="h-7 px-3 rounded-lg bg-tw-text-primary text-[#0D0D0F] text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
						>
							{addingAll ? "Adding..." : "Add all to allowlist"}
						</button>
						<button
							type="button"
							onClick={() => setDismissed(true)}
							className="h-7 px-3 rounded-lg bg-tw-hover text-tw-text-secondary text-[12px] font-medium hover:text-tw-text-primary transition-colors"
						>
							Dismiss
						</button>
					</div>
				</div>
			)}

			{/* Helper text */}
			<div className="flex items-center gap-2 -mt-1.5 px-1">
				<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l4.5 1.6V7c0 3-2.2 4.7-4.5 5.4C4.7 11.7 2.5 10 2.5 7V3.1L7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d={subtab === "block" ? "M5 7h4" : "M5 7l1.5 1.5L9 5.5"} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
				<span className="text-[12px] text-[#6E6E6E]">
					{subtab === "block"
						? "These users are blocked before any rule runs. They never reach your repos."
						: "These users bypass all rules. Their contributions are always accepted."}
				</span>
			</div>

			{/* User list */}
			{filtered.length > 0 ? (
				<div className="rounded-xl bg-tw-card p-1 flex flex-col gap-1">
					{filtered.map((user) => (
						<div
							key={user.username}
							className="flex items-center gap-3 h-14 px-2.5 rounded-[8px] hover:bg-[#FAFAFA14] group"
						>
							<div className="relative shrink-0">
								<img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
								<span
									className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-tw-card"
									style={{ background: activeColor }}
								/>
							</div>
							<div className="flex-1 min-w-0 flex flex-col">
								<div className="flex items-center gap-2 min-w-0">
									<span className="text-[13px] leading-5 text-[#EEEEEE] font-medium truncate">@{user.username}</span>
								</div>
								<div className="flex items-center gap-2 text-[11px] text-[#6E6E6E] truncate">
									{user.reason && <span className="truncate max-w-[360px]">{user.reason}</span>}
									{user.reason && user.addedAt && <span>·</span>}
									{user.addedAt && (
										<span className="whitespace-nowrap">
											{user.addedBy ? <>added by <span className="text-[#9F9FA9]">{user.addedBy}</span> · </> : null}
											{user.addedAt}
										</span>
									)}
								</div>
							</div>
							<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
								<button
									type="button"
									onClick={() => handleMove(user)}
									className="h-7 px-2.5 rounded-[6px] text-[11px] text-[#B4B4B4] hover:text-[#EEEEEE] hover:bg-[#FAFAFA14]"
								>
									Move to {subtab === "block" ? "allowlist" : "blocklist"}
								</button>
								<button
									type="button"
									onClick={() => handleRemove(user)}
									className="h-7 px-2.5 rounded-[6px] text-[11px] text-[#B4B4B4] hover:text-[#F56D5D] hover:bg-[#FAFAFA14]"
								>
									Remove
								</button>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded-xl bg-tw-card p-6 text-center">
					<p className="text-[13px] text-[#6E6E6E]">
						{search ? `No users match "${search}"` : `No users on the ${subtab === "block" ? "blocklist" : "allowlist"} yet.`}
					</p>
				</div>
			)}
		</div>
	);
}
