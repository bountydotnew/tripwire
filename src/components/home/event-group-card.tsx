import { type TripwireEvent, type User, USERS } from "./mock-data";

interface EventGroupCardProps {
	group: {
		key: string;
		items: TripwireEvent[];
	};
	onOpenEvent?: (event: TripwireEvent) => void;
}

function getUser(username: string): User {
	return USERS[username] || {
		username,
		name: username,
		avatar: `https://github.com/${username}.png`,
		accountAge: "Unknown",
		publicRepos: 0,
		followers: 0,
		mergedPrs: 0,
		readme: false,
		tint: "#888",
	};
}

export function EventGroupCard({ group, onOpenEvent }: EventGroupCardProps) {
	const first = group.items[0];
	const users = group.items.flatMap((e) => e.users);

	return (
		<div className="flex flex-col relative rounded-xl overflow-hidden gap-[3px] w-full bg-tw-card p-1">
			{/* Highlighted content preview */}
			<button
				onClick={() => onOpenEvent?.(first)}
				type="button"
				className="rounded-[10px] text-left group focus:outline-none cursor-pointer"
			>
				<div className="flex flex-col rounded-[10px] gap-1 bg-tw-inner group-hover:bg-[#FAFAFA26] transition-colors p-2">
					{users.length === 1 && first.preview ? (
						<SingleUserPreview
							user={getUser(users[0])}
							preview={first.preview}
						/>
					) : (
						<MultiUserRow userKeys={users} />
					)}
				</div>
			</button>

			{/* Action banner */}
			<div className="rounded-xl">
				<div className="flex items-center gap-3 justify-between p-1">
					<div className="flex items-center min-w-0 relative px-1.5 gap-2">
						<AlertTriangleSolid
							color={
								first.severity === "warning"
									? "#D1BC00"
									: first.severity === "success"
										? "#67E19F"
										: "#F56D5D"
							}
						/>
						<span className="shrink-0 text-[14px] leading-[22px] text-tw-text-primary whitespace-nowrap">
							{first.title}
						</span>
					</div>
					{first.action ? (
						<button
							onClick={(ev) => {
								ev.stopPropagation();
								onOpenEvent?.(first);
							}}
							type="button"
							className="flex items-center h-8 shrink-0 px-2.5 rounded-[10px] justify-center gap-1.5 bg-[#363639] hover:bg-[#404044] transition-colors whitespace-nowrap text-tw-text-primary"
						>
							{first.action.kind === "close" ? (
								<CloseCircleSolid />
							) : first.action.kind === "pause" ? (
								<PauseHourglassSolid />
							) : null}
							<span className="text-[13px] leading-none text-center text-tw-text-primary">
								{first.action.label}
							</span>
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}

interface SingleUserPreviewProps {
	user: User;
	preview: string;
}

function SingleUserPreview({ user, preview }: SingleUserPreviewProps) {
	// Split preview at "Payout" to highlight wallet addresses
	const [head, rest] = (() => {
		if (preview.includes("Payout")) {
			return [preview.split(" Payout")[0], "Payout" + preview.split(" Payout")[1]];
		}
		return [preview, ""];
	})();

	return (
		<div className="flex gap-1">
			<div
				className="items-center flex h-[25px] justify-center min-w-4 w-[25px] overflow-hidden rounded-full shrink-0 bg-cover bg-center"
				style={{ backgroundImage: `url('${user.avatar}')` }}
			/>
			<div className="flex items-start basis-0 grow gap-2 min-w-0">
				<div className="basis-0 grow min-w-0">
					<div>
						<div className="inline-flex">
							<div className="flex items-center rounded-lg py-[1px] px-1 gap-1">
								<span className="text-[14px] leading-5 text-tw-text-primary">
									{user.username}
								</span>
							</div>
						</div>
						<div className="inline-block text-[14px] leading-[25px] text-tw-text-secondary whitespace-pre-wrap">
							{head}
							{rest ? (
								<>
									{" "}
									<span className="text-tw-text-secondary">
										Payout wallets:
									</span>
									{"  "}
									<span className="font-mono text-tw-text-secondary">
										{rest.replace(/^Payout wallets:\s*/, "")}
									</span>
								</>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

interface MultiUserRowProps {
	userKeys: string[];
}

function MultiUserRow({ userKeys }: MultiUserRowProps) {
	const uniqueKeys = [...new Set(userKeys)];

	return (
		<div className="flex gap-1 items-center">
			<div className="flex items-center gap-[5px]">
				{uniqueKeys.slice(0, 6).map((username, index) => {
					const user = getUser(username);
					return (
						<div key={`${username}-${index}`} className="flex items-center gap-0">
							<div
								className="w-[18px] h-[18px] rounded-full bg-cover bg-center shrink-0"
								style={{ backgroundImage: `url('${user.avatar}')` }}
							/>
							<div className="h-5 relative shrink-0">
								<span className="left-[2px] top-0 absolute text-[14px] leading-5 text-tw-text-primary whitespace-nowrap">
									{user.username}
								</span>
								<span className="invisible text-[14px] leading-5 px-[2px]">
									{user.username}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface AlertTriangleSolidProps {
	color: string;
}

export function AlertTriangleSolid({ color }: AlertTriangleSolidProps) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			className="shrink-0"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M13.998 21.75C16.253 21.75 18.033 21.75 19.352 21.554C20.69 21.354 21.776 20.922 22.376 19.863C22.975 18.806 22.79 17.65 22.276 16.395C21.772 15.161 20.866 13.633 19.717 11.696L19.669 11.616L17.744 8.371L17.698 8.293C16.596 6.434 15.723 4.963 14.911 3.965C14.083 2.946 13.184 2.25 12 2.25C10.816 2.25 9.917 2.946 9.089 3.965C8.277 4.963 7.405 6.434 6.303 8.293L6.256 8.371L4.331 11.616L4.283 11.696C3.135 13.633 2.228 15.161 1.724 16.395C1.21 17.65 1.025 18.806 1.624 19.863C2.224 20.922 3.31 21.354 4.648 21.554C5.967 21.75 7.747 21.75 10.002 21.75L13.998 21.75ZM12 10.25C11.448 10.25 11 9.802 11 9.25C11 8.698 11.448 8.25 12 8.25C12.552 8.25 13 8.698 13 9.25C13 9.802 12.552 10.25 12 10.25ZM12 18C11.448 18 11 17.552 11 17L11 13C11 12.448 11.448 12 12 12C12.552 12 13 12.448 13 13L13 17C13 17.552 12.552 18 12 18Z"
				fill={color}
			/>
		</svg>
	);
}

function CloseCircleSolid() {
	return (
		<svg
			viewBox="0 0 16 16"
			width="16"
			height="16"
			fill="currentColor"
			className="shrink-0"
		>
			<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z" />
		</svg>
	);
}

function PauseHourglassSolid() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="currentColor"
			className="shrink-0"
		>
			<path d="M20.75 4.25H19.25V5.204C19.25 6.623 18.638 7.968 17.581 8.891L17.364 9.068L13.585 12L17.364 14.932L17.581 15.109C18.638 16.032 19.25 17.377 19.25 18.796V19.75H20.75V21.75H3.25V19.75H4.75V18.796C4.75 17.283 5.447 15.854 6.636 14.932L10.414 12L6.636 9.068C5.447 8.146 4.75 6.717 4.75 5.204V4.25H3.25V2.25H20.75V4.25ZM6.684 4.25V5.204C6.684 6.112 7.102 6.97 7.815 7.523L12 10.77L16.185 7.523L16.315 7.415C16.949 6.861 17.316 6.055 17.316 5.204V4.25H6.684Z" />
		</svg>
	);
}
