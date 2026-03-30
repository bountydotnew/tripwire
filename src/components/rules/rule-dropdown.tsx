import { useState, useRef, useEffect } from "react";

interface RuleDropdownProps {
	value: string;
	options?: string[];
	onChange?: (value: string) => void;
}

export function RuleDropdown({ value, options, onChange }: RuleDropdownProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [open]);

	return (
		<span className="relative inline-flex" ref={ref} data-dropdown>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					options && onChange && setOpen(!open);
				}}
				className="inline-flex items-center h-[22px] rounded-[10px] px-[5px] gap-2 bg-[oklch(26.4%_0_0)] border border-[#353434] cursor-pointer"
			>
				<span className="text-xs text-center text-white font-medium">
					{value}
				</span>
				<svg
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					style={{ flexShrink: 0 }}
				>
					<path
						d="M6 9l6 6 6-6"
						stroke="#FFFFFF"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{open && options && (
				<div className="absolute top-full left-0 mt-1 z-50 min-w-[80px] rounded-lg bg-[#2a2a2a] border border-[#353434] shadow-lg py-1">
					{options.map((opt) => (
						<button
							key={opt}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onChange?.(opt);
								setOpen(false);
							}}
							className={`w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#353434] border-none bg-transparent cursor-pointer ${
								opt === value ? "font-medium" : ""
							}`}
						>
							{opt}
						</button>
					))}
				</div>
			)}
		</span>
	);
}
