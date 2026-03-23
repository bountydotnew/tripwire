export function ChevronDown({ className }: { className?: string }) {
	return (
		<svg
			width="10"
			height="8"
			viewBox="0 0 10 6"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			style={{ display: "block", flexShrink: 0 }}
		>
			<path
				d="M1 1L5 5L9 1"
				stroke="#787878"
				strokeWidth="1.33"
				strokeLinecap="square"
				fill="none"
			/>
		</svg>
	);
}
