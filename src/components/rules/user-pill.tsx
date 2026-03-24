import { CloseIcon } from "../icons/close-icon";
import { Button } from "#/components/ui/button";

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
			<Button
				onClick={onRemove}
				variant="ghost"
				size="icon-xs"
				className="size-4 p-0"
			>
				<CloseIcon className="size-3 text-white/50" />
			</Button>
		</div>
	);
}
