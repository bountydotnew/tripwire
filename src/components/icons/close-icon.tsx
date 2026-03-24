export function CloseIcon({ className }: { className?: string }) {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			className={className}
			style={{ flexShrink: 0 }}
		>
			<path
				d="M6 18L18 6M6 6l12 12"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}
