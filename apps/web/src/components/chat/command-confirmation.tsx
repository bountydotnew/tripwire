import type { MutationConfirmation } from "#/lib/chat-commands";

interface CommandConfirmationProps {
	confirmation: MutationConfirmation;
	onConfirm: () => void;
	onCancel: () => void;
	isLoading?: boolean;
}

/**
 * Confirmation card shown above the chat input when the user runs a
 * mutation slash command (/block, /allow, /unblock, /disallow).
 */
export function CommandConfirmation({
	confirmation,
	onConfirm,
	onCancel,
	isLoading,
}: CommandConfirmationProps) {
	const confirmClasses = confirmation.danger
		? "bg-tw-error text-white hover:bg-tw-error/90"
		: "bg-tw-text-primary text-[#0D0D0F] hover:opacity-90";

	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2 mb-1.5 border border-tw-border/60">
			<div className="flex items-start gap-2">
				{confirmation.danger ? (
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="none"
						className="text-tw-error shrink-0 mt-0.5"
					>
						<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
						<path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
						<circle cx="7" cy="9.5" r="0.75" fill="currentColor" />
					</svg>
				) : (
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="none"
						className="text-tw-text-muted shrink-0 mt-0.5"
					>
						<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
						<path d="M7 4v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
						<circle cx="7" cy="9.5" r="0.75" fill="currentColor" />
					</svg>
				)}
				<div className="flex-1 min-w-0">
					<div className="text-[13px] text-tw-text-primary font-medium leading-tight">
						{confirmation.title}
					</div>
					<div className="text-[12px] text-tw-text-muted mt-1 leading-relaxed">
						{confirmation.description}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onConfirm}
					disabled={isLoading}
					className={`h-7 px-3 rounded-lg text-[12px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
				>
					{isLoading ? "..." : confirmation.confirmLabel}
				</button>
				<button
					type="button"
					onClick={onCancel}
					disabled={isLoading}
					className="h-7 px-3 rounded-lg bg-tw-hover text-tw-text-secondary text-[12px] font-medium hover:text-tw-text-primary transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
