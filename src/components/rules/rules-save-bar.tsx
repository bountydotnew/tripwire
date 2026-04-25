import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "#/components/icons/chevron-down";
import { CloseIcon } from "#/components/icons/close-icon";
import type { RuleConfigChange, RuleConfigChangeTone } from "#/lib/rules/config-draft";

interface RulesSaveBarProps {
	dirty: boolean;
	saving?: boolean;
	saved?: boolean;
	changes: RuleConfigChange[];
	onSave: () => void;
	onDiscard: () => void;
	onRevert: (changeId: string) => void;
}

const ENTER_EXIT_TRANSITION = {
	duration: 0.18,
	ease: [0.19, 1, 0.22, 1] as const,
};

const SHELL_TRANSITION = {
	type: "spring",
	stiffness: 360,
	damping: 30,
	mass: 0.82,
};

const CHANGE_TONE_CLASSES: Record<RuleConfigChangeTone, string> = {
	neutral: "border-white/8 bg-[#ffffff08] text-tw-text-primary",
	muted: "border-white/8 bg-[#ffffff08] text-tw-text-tertiary",
	accent: "border-white/8 bg-[#ffffff08] text-tw-text-secondary",
	success: "border-white/8 bg-[#ffffff08] text-tw-text-secondary",
	warning: "border-white/8 bg-[#ffffff08] text-tw-text-secondary",
	danger: "border-white/8 bg-[#ffffff08] text-tw-text-secondary",
};

function ChangePill({
	value,
	tone = "neutral",
}: {
	value: string;
	tone?: RuleConfigChangeTone;
}) {
	return (
		<span
			className={`inline-flex h-4 items-center rounded-[6px] border px-1.5 text-[10px] font-medium ${CHANGE_TONE_CLASSES[tone]}`}
		>
			{value}
		</span>
	);
}

function SaveSpinner() {
	return (
		<motion.span
			className="size-3 rounded-full border border-tw-text-secondary border-t-transparent"
			animate={{ rotate: 360 }}
			transition={{ duration: 0.8, ease: "linear", repeat: Infinity }}
		/>
	);
}

function SaveCheckIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path
				d="M2.2 6.2 4.75 8.45 9.8 3.55"
				stroke="currentColor"
				strokeWidth="1.55"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function RulesSaveBar({
	dirty,
	saving = false,
	saved = false,
	changes,
	onSave,
	onDiscard,
	onRevert,
}: RulesSaveBarProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		const handlePointerDown = (event: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [open]);

	useEffect(() => {
		if (!dirty || changes.length === 0) {
			setOpen(false);
		}
	}, [changes.length, dirty]);

	useEffect(() => {
		if (saving) {
			setOpen(false);
		}
	}, [saving]);

	const isDropdownOpen = dirty && open && changes.length > 0;
	const isVisible = dirty || saving || saved;
	const shellClassName =
		dirty && !saving ? "w-full max-w-[560px]" : "w-auto max-w-full";

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
			<AnimatePresence initial={false}>
				{isVisible ? (
					<motion.div
						key="save-shell"
						ref={containerRef}
						initial={{ opacity: 0, y: 12, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 10, scale: 0.98 }}
						layout
						transition={SHELL_TRANSITION}
						className={`pointer-events-auto relative ${shellClassName}`}
						data-testid="rules-save-bar"
					>
						<AnimatePresence>
							{isDropdownOpen ? (
								<motion.div
									initial={{ opacity: 0, y: 8, scale: 0.985 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									exit={{ opacity: 0, y: 8, scale: 0.985 }}
									transition={ENTER_EXIT_TRANSITION}
									className="absolute bottom-full left-0 right-0 mb-1.5"
								>
									<div
										className="rounded-2xl bg-tw-card p-1.5"
										style={{ boxShadow: "0 8px 24px #00000040, 0 1px 2px #0000001a" }}
									>
										<div className="max-h-72 overflow-y-auto">
											{changes.map((change) => (
												<div
													key={change.id}
													className="group flex items-start gap-2 border-b border-white/[0.05] px-2.5 py-2 last:border-b-0"
												>
													<div className="min-w-0 flex-1">
														<p className="truncate text-[12px] text-tw-text-secondary">
															{change.title}
														</p>
														<div className="mt-0.5 flex flex-wrap items-center gap-1">
															{change.before ? (
																<ChangePill value={change.before} tone={change.beforeTone} />
															) : null}
															{change.before && change.after ? (
																<span className="text-[10px] text-tw-text-tertiary/80">
																	{"->"}
																</span>
															) : null}
															{change.after ? (
																<ChangePill value={change.after} tone={change.afterTone} />
															) : null}
														</div>
													</div>
													<button
														type="button"
														onClick={() => onRevert(change.id)}
														disabled={saving}
														className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-tw-text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-tw-hover hover:text-tw-text-secondary disabled:cursor-not-allowed disabled:opacity-30"
														aria-label={`Revert ${change.label}`}
													>
														<CloseIcon className="size-2.5" />
													</button>
												</div>
											))}
										</div>
									</div>
								</motion.div>
							) : null}
						</AnimatePresence>

						<motion.div layout transition={SHELL_TRANSITION}>
							<div
								className="rounded-2xl bg-tw-card p-1.5"
								style={{ boxShadow: "0 8px 24px #00000040, 0 1px 2px #0000001a" }}
							>
								<AnimatePresence initial={false} mode="popLayout">
									{saving ? (
										<motion.div
											key="saving"
											layout
											initial={{ opacity: 0.92 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={ENTER_EXIT_TRANSITION}
											className="flex h-9 items-center justify-center px-3"
											data-testid="rules-save-bar-saving"
										>
											<SaveSpinner />
										</motion.div>
									) : dirty ? (
										<motion.div
											key="dirty"
											layout
											initial={{ opacity: 0.92 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={ENTER_EXIT_TRANSITION}
											className="flex items-center gap-1.5"
										>
											<button
												type="button"
												onClick={() => setOpen((current) => !current)}
												disabled={saving}
												className="flex h-9 flex-1 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left transition-colors hover:bg-tw-hover disabled:cursor-not-allowed"
												aria-label={isDropdownOpen ? "Hide pending changes" : "Show pending changes"}
											>
												<span className="truncate text-[14px] text-tw-text-secondary">
													{changes.length} change{changes.length === 1 ? "" : "s"} not saved
												</span>
												<ChevronDown
													className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
												/>
											</button>

											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={onDiscard}
													disabled={saving}
													className="flex size-9 items-center justify-center rounded-[10px] text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
													aria-label="Discard changes"
												>
													<CloseIcon className="size-3" />
												</button>

												<button
													type="button"
													onClick={onSave}
													disabled={saving}
													className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[#363639] px-3 transition-colors hover:bg-[#404044] disabled:cursor-not-allowed disabled:opacity-60"
												>
													<span className="text-tw-text-secondary">
														<SaveCheckIcon />
													</span>
													<span className="text-[13px] leading-none text-tw-text-primary">
														Save
													</span>
												</button>
											</div>
										</motion.div>
									) : saved ? (
										<motion.div
											key="saved"
											layout
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={ENTER_EXIT_TRANSITION}
											className="flex items-center gap-1.5"
											data-testid="rules-save-bar-saved"
										>
											<div className="flex h-9 items-center gap-2 px-2.5">
												<motion.svg
													viewBox="0 0 12 12"
													className="size-3 text-tw-text-secondary"
													fill="none"
													initial="hidden"
													animate="visible"
												>
													<motion.path
														d="M2.25 6.35 4.8 8.65 9.75 3.4"
														stroke="currentColor"
														strokeWidth="1.6"
														strokeLinecap="round"
														strokeLinejoin="round"
														variants={{
															hidden: { pathLength: 0, opacity: 0 },
															visible: {
																pathLength: 1,
																opacity: 1,
																transition: { duration: 0.3, ease: "easeOut", delay: 0.06 },
															},
														}}
													/>
												</motion.svg>
												<span className="text-[14px] text-tw-text-primary">Saved</span>
											</div>
										</motion.div>
									) : null}
								</AnimatePresence>
							</div>
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
