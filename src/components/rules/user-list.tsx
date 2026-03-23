import { useState } from "react";
import { UserPill } from "./user-pill";

interface User {
	username: string;
	avatarUrl: string;
}

interface UserListProps {
	title: string;
	description: string;
	users: User[];
	onAdd?: (username: string) => void;
	onRemove?: (username: string) => void;
}

export function UserList({ title, description, users, onAdd, onRemove }: UserListProps) {
	const [search, setSearch] = useState("");

	function handleAdd() {
		const username = search.trim().replace(/^@/, "");
		if (username && onAdd) {
			onAdd(username);
			setSearch("");
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAdd();
		}
	}

	return (
		<div className="flex flex-col items-start gap-3 w-full rounded-xl bg-tw-card p-4">
			<div className="flex flex-col items-start gap-2 w-full">
				<div className="flex items-center justify-between w-full">
					<div className="flex flex-col gap-0.5">
						<div className="tracking-[-0.02em] text-white font-medium text-base leading-5">
							{title}
						</div>
						<div className="text-tw-text-secondary text-xs leading-4">
							{description}
						</div>
					</div>
					<div className="flex items-start gap-2 shrink-0">
						<div className="inline-flex relative w-64 h-7 rounded-[10px] bg-[oklab(100%_0_0/2.6%)] border border-[oklab(100%_0_0/8%)] shadow-[oklch(0%_0_0/5%)_0px_1px_2px]">
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Search for a user"
								className="h-7 min-w-0 w-full rounded-[10px] px-[11px] bg-transparent border-none outline-none text-sm text-white placeholder:text-[oklab(60.4%_0_0/72%)]"
							/>
						</div>
						<button
							type="button"
							onClick={handleAdd}
							className="flex items-center h-7 justify-center rounded-[10px] px-[9px] bg-white border border-[#CDCDCD] cursor-pointer"
						>
							<span className="text-sm text-center text-black font-medium">
								Add
							</span>
						</button>
					</div>
				</div>
			</div>
			{users.length > 0 && (
				<div className="flex flex-wrap rounded-xl w-full gap-2">
					{users.map((user) => (
						<UserPill
							key={user.username}
							username={user.username}
							avatarUrl={user.avatarUrl}
							onRemove={() => onRemove?.(user.username)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
