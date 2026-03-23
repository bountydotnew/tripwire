import { CloseIcon } from "../icons/close-icon";

interface UserPillProps {
	username: string;
	avatarUrl: string;
	onRemove?: () => void;
}

export function UserPill({ username, avatarUrl, onRemove }: UserPillProps) {
	return (
		<div className="flex items-center rounded-full gap-2 justify-center px-[3px] py-0.5 bg-[oklch(26.4%_0_0)] border border-[#353434]">
			<div className="flex items-start gap-1.5">
				<div
					className="w-[17px] h-[17px] rounded-full bg-cover bg-center shrink-0"
					style={{ backgroundImage: `url(${avatarUrl})` }}
				/>
				<span className="text-xs text-center text-white font-medium">
					@{username}
				</span>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="bg-transparent border-none p-0 cursor-pointer flex items-center"
			>
				<CloseIcon />
			</button>
		</div>
	);
}
