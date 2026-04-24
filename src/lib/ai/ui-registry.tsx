import { defineRegistry } from "@json-render/react";
import { catalog } from "./ui-catalog";

/**
 * Component Registry for AI tool results
 * Maps catalog components to styled React implementations
 */
export const { registry } = defineRegistry(catalog, {
	components: {
		// ─── User Profile Card ────────────────────────────────────────
		UserCard: ({ props }) => {
			const statusText =
				props.status === "blacklisted"
					? "Blacklisted"
					: props.status === "whitelisted"
						? "Whitelisted"
						: "Normal";

			const statusColor =
				props.status === "blacklisted"
					? "text-tw-error"
					: props.status === "whitelisted"
						? "text-tw-success"
						: "text-tw-text-secondary";

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-center gap-2.5">
						{props.avatar && (
							<img
								src={props.avatar}
								alt=""
								className="size-10 rounded-full"
							/>
						)}
						<div>
							<div className="text-[14px] text-tw-text-primary font-medium">
								@{props.username}
							</div>
							{props.name && (
								<div className="text-[12px] text-tw-text-muted">{props.name}</div>
							)}
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2 text-[12px]">
						<div>
							<span className="text-tw-text-muted">Repos: </span>
							<span className="text-tw-text-secondary">{props.publicRepos}</span>
						</div>
						<div>
							<span className="text-tw-text-muted">Followers: </span>
							<span className="text-tw-text-secondary">{props.followers}</span>
						</div>
						<div>
							<span className="text-tw-text-muted">Tripwire events: </span>
							<span className="text-tw-text-secondary">
								{props.tripwireEventCount}
							</span>
						</div>
						<div>
							<span className="text-tw-text-muted">Status: </span>
							<span className={statusColor}>{statusText}</span>
						</div>
					</div>
				</div>
			);
		},

		// ─── Events List ──────────────────────────────────────────────
		EventsList: ({ props }) => {
			if (props.events.length === 0) {
				return (
					<div className="rounded-xl bg-tw-card p-3 text-[13px] text-tw-text-secondary">
						No events found.
					</div>
				);
			}

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					{props.title && (
						<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
							{props.title}
						</div>
					)}
					<div className="space-y-1.5">
						{props.events.slice(0, 5).map((event) => (
							<div key={event.id} className="flex items-center gap-2 text-[12px]">
								<span
									className={`size-1.5 rounded-full ${
										event.severity === "error"
											? "bg-tw-error"
											: event.severity === "warning"
												? "bg-tw-warning"
												: "bg-tw-text-muted"
									}`}
								/>
								<span className="text-tw-text-secondary truncate flex-1">
									{event.description}
								</span>
								{event.username && (
									<span className="text-tw-text-muted shrink-0">
										@{event.username}
									</span>
								)}
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Single Event Card ────────────────────────────────────────
		EventCard: ({ props }) => {
			const severityColor =
				props.severity === "error"
					? "border-tw-error/20 bg-[#F56D5D0D]"
					: props.severity === "warning"
						? "border-tw-warning/20 bg-[#F5A6230D]"
						: "border-tw-text-muted/20 bg-tw-card";

			const dotColor =
				props.severity === "error"
					? "bg-tw-error"
					: props.severity === "warning"
						? "bg-tw-warning"
						: "bg-tw-text-muted";

			return (
				<div className={`rounded-xl border p-3 flex flex-col gap-2 ${severityColor}`}>
					<div className="flex items-start gap-2">
						<span className={`size-2 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
						<div className="flex-1 min-w-0">
							<div className="text-[13px] text-tw-text-primary font-medium">
								{props.action}
							</div>
							<div className="text-[12px] text-tw-text-secondary mt-0.5">
								{props.description}
							</div>
						</div>
					</div>
					<div className="flex items-center justify-between text-[11px] text-tw-text-muted">
						<span>{props.date}</span>
						{props.username && <span>@{props.username}</span>}
					</div>
				</div>
			);
		},

		// ─── Action Result ────────────────────────────────────────────
		ActionResult: ({ props }) => {
			const bgColor = props.success
				? "bg-[#4ADE801A] border-tw-success/20"
				: "bg-[#F56D5D1A] border-tw-error/20";

			const iconColor = props.success ? "text-tw-success" : "text-tw-error";

			return (
				<div className={`rounded-xl border p-3 flex items-center gap-2 ${bgColor}`}>
					{props.success ? (
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							className={iconColor}
						>
							<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
							<path
								d="M4 7L6 9L10 5"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					) : (
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							className={iconColor}
						>
							<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
							<path
								d="M5 5L9 9M9 5L5 9"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
							/>
						</svg>
					)}
					<span className="text-[13px] text-tw-text-primary">{props.message}</span>
				</div>
			);
		},

		// ─── Lists Overview ───────────────────────────────────────────
		ListsOverview: ({ props }) => {
			const hasBlacklist = props.blacklist.length > 0;
			const hasWhitelist = props.whitelist.length > 0;

			if (!hasBlacklist && !hasWhitelist) {
				return (
					<div className="rounded-xl bg-tw-card p-3 text-[13px] text-tw-text-secondary">
						No users on either list.
					</div>
				);
			}

			return (
				<div className="flex flex-col gap-3">
					{/* Blacklist */}
					<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
						<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted uppercase tracking-wider">
							<svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-tw-error">
								<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
								<path d="M4 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
							</svg>
							Blacklist
						</div>
						{hasBlacklist ? (
							<div className="space-y-1.5">
								{props.blacklist.map((user) => (
									<div key={user.username} className="flex items-center gap-2 text-[12px]">
										{user.avatar && (
											<img src={user.avatar} alt="" className="size-5 rounded-full" />
										)}
										<span className="text-tw-text-primary font-medium">@{user.username}</span>
										<span className="text-tw-text-muted ml-auto">{user.addedAt}</span>
									</div>
								))}
							</div>
						) : (
							<div className="text-[12px] text-tw-text-muted">
								No users blacklisted.
							</div>
						)}
					</div>

					{/* Whitelist */}
					<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
						<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted uppercase tracking-wider">
							<svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-tw-success">
								<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
								<path d="M4 7L6 9L10 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							Whitelist
						</div>
						{hasWhitelist ? (
							<div className="space-y-1.5">
								{props.whitelist.map((user) => (
									<div key={user.username} className="flex items-center gap-2 text-[12px]">
										{user.avatar && (
											<img src={user.avatar} alt="" className="size-5 rounded-full" />
										)}
										<span className="text-tw-text-primary font-medium">@{user.username}</span>
										<span className="text-tw-text-muted ml-auto">{user.addedAt}</span>
									</div>
								))}
							</div>
						) : (
							<div className="text-[12px] text-tw-text-muted">
								No users whitelisted.
							</div>
						)}
					</div>
				</div>
			);
		},

		// ─── Lists Status ─────────────────────────────────────────────
		ListsStatus: ({ props }) => {
			const status = props.isBlacklisted
				? "blacklisted"
				: props.isWhitelisted
					? "whitelisted"
					: "normal";

			const statusText =
				status === "blacklisted"
					? "Blacklisted"
					: status === "whitelisted"
						? "Whitelisted"
						: "Not on any list";

			const statusColor =
				status === "blacklisted"
					? "text-tw-error"
					: status === "whitelisted"
						? "text-tw-success"
						: "text-tw-text-muted";

			const reason = props.isBlacklisted
				? props.blacklistReason
				: props.isWhitelisted
					? props.whitelistReason
					: null;

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<span className="text-[12px] text-tw-text-muted">
							@{props.username}
						</span>
						<span className={`text-[12px] font-medium ${statusColor}`}>
							{statusText}
						</span>
					</div>
					{reason && (
						<div className="text-[11px] text-tw-text-secondary">{reason}</div>
					)}
				</div>
			);
		},

		// ─── Text Block ───────────────────────────────────────────────
		Text: ({ props }) => {
			const colorClass =
				props.variant === "muted"
					? "text-tw-text-muted"
					: props.variant === "error"
						? "text-tw-error"
						: props.variant === "success"
							? "text-tw-success"
							: "text-tw-text-secondary";

			return <div className={`text-[13px] ${colorClass}`}>{props.content}</div>;
		},

		// ─── Info Row ─────────────────────────────────────────────────
		InfoRow: ({ props }) => (
			<div className="flex items-center justify-between text-[12px]">
				<span className="text-tw-text-muted">{props.label}</span>
				<span className="text-tw-text-secondary">{props.value}</span>
			</div>
		),

		// ─── Container Card ───────────────────────────────────────────
		Card: ({ props, children }) => (
			<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
				{props.title && (
					<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
						{props.title}
					</div>
				)}
				{children}
			</div>
		),

		// ─── Stack Layout ─────────────────────────────────────────────
		Stack: ({ props, children }) => {
			const gapClass =
				props.gap === "sm" ? "gap-1" : props.gap === "lg" ? "gap-4" : "gap-2";

			return <div className={`flex flex-col ${gapClass}`}>{children}</div>;
		},
	},
});
