interface NavIconProps {
	active?: boolean;
}

export function HomeNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path
				d="M15 17C14.201 17.622 13.15 18 12 18C10.85 18 9.8 17.622 9 17"
				stroke={c}
				strokeLinecap="round"
				strokeWidth="2"
			/>
			<path
				d="M2.352 13.213C1.998 10.916 1.822 9.768 2.256 8.749C2.691 7.731 3.654 7.034 5.581 5.641L7.021 4.6C9.418 2.867 10.617 2 12 2C13.383 2 14.582 2.867 16.979 4.6L18.419 5.641C20.346 7.034 21.31 7.731 21.744 8.749C22.178 9.768 22.002 10.916 21.649 13.213L21.348 15.172C20.847 18.429 20.597 20.057 19.429 21.029C18.261 22 16.554 22 13.139 22H10.861C7.446 22 5.739 22 4.571 21.029C3.403 20.057 3.153 18.429 2.653 15.172L2.352 13.213Z"
				stroke={c}
				strokeLinejoin="round"
				strokeWidth="2"
			/>
		</svg>
	);
}

export function RulesNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path
				d="M9 6C8.448 6 8 6.448 8 7C8 7.552 8.448 8 9 8V6ZM15 8C15.552 8 16 7.552 16 7C16 6.448 15.552 6 15 6V8ZM9 10C8.448 10 8 10.448 8 11C8 11.552 8.448 12 9 12V10ZM12 12C12.552 12 13 11.552 13 11C13 10.448 12.552 10 12 10V12ZM7 4H17V2H7V4ZM18 5V19H20V5H18ZM17 20H7V22H17V20ZM6 19V5H4V19H6ZM7 20C6.448 20 6 19.552 6 19H4C4 20.657 5.343 22 7 22V20ZM18 19C18 19.552 17.552 20 17 20V22C18.657 22 20 20.657 20 19H18ZM17 4C17.552 4 18 4.448 18 5H20C20 3.343 18.657 2 17 2V4ZM7 2C5.343 2 4 3.343 4 5H6C6 4.448 6.448 4 7 4V2ZM18 12V15H20V12H18ZM17 16H7V18H17V16ZM7 22H10V20H7V22ZM7 16C5.343 16 4 17.343 4 19H6C6 18.448 6.448 18 7 18V16ZM18 15C18 15.552 17.552 16 17 16V18C18.657 18 20 16.657 20 15H18ZM9 8H15V6H9V8ZM9 12H12V10H9V12Z"
				fill={c}
			/>
		</svg>
	);
}

export function InsightsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path
				d="M3 10.989L3.969 13.304C4.328 14.159 5.548 14.112 5.84 13.232L7.021 9.67C7.328 8.744 8.634 8.756 8.924 9.688L11.909 19.294C12.213 20.271 13.604 20.221 13.837 19.225L17.219 4.775C17.448 3.798 18.803 3.724 19.135 4.671L21 9.983"
				stroke={c}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function WorkflowsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path d="M6 8L6 16" stroke={c} strokeLinecap="round" strokeWidth="2" />
			<path
				d="M18 16V12C18 9.172 18 7.757 17.121 6.879C16.243 6 14.828 6 12 6L11 6M11 6C11 5.3 12.994 3.992 13.5 3.5M11 6C11 6.7 12.994 8.008 13.5 8.5"
				stroke={c}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
			/>
			<circle cx="6" cy="18" r="2" stroke={c} strokeWidth="2" />
			<circle cx="6" cy="6" r="2" stroke={c} strokeWidth="2" />
			<circle cx="18" cy="18" r="2" stroke={c} strokeWidth="2" />
		</svg>
	);
}

export function EventsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path
				d="M3 5V9H7"
				stroke={c}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M3.512 15C4.747 18.496 8.081 21 12 21C16.97 21 21 16.971 21 12C21 7.029 16.97 3 12 3C8.27 3 5.071 5.268 3.706 8.5"
				stroke={c}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M12 8V12L15 15"
				stroke={c}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function IntegrationsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
			<path
				d="M19 14V9C19 7.895 18.105 7 17 7H7C5.895 7 5 7.895 5 9V14C5 16.209 6.791 18 9 18H15C17.209 18 19 16.209 19 14Z"
				stroke={c}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M12 18V21M15 7V3M9 7V3"
				stroke={c}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function DotsHorizontalIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
			<path
				d="M11.996 12H12.005"
				stroke="#9F9FA9"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2.5"
			/>
			<path
				d="M18 12H18.009"
				stroke="#9F9FA9"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2.5"
			/>
			<path
				d="M6 12H6.009"
				stroke="#9F9FA9"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2.5"
			/>
		</svg>
	);
}

export function TripwireSparkIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 610.08 589.32"
			width="18"
			height="18"
			fill="currentColor"
			className={className}
			preserveAspectRatio="none"
		>
			<path d="M609.85 266.25c-2.93-37.11-34.21-66.57-72.05-66.57H74.66c-42.93-.01-77.81 35.17-74.43 77.96 2.93 37.11 34.21 66.58 72.05 66.58h80.92c19.88 0 37.14-13.09 43.16-32.03 14.65-46.07 57.76-79.45 108.69-79.45s94.03 33.38 108.69 79.45c6.02 18.94 23.29 32.03 43.16 32.03h78.53c42.93 0 77.81-35.17 74.44-77.97ZM305.04 409.68c-37.82 0-71.03-19.68-90-49.33v138.97c0 49.5 40.5 90 90 90s90-40.5 90-90V360.35c-18.98 29.66-52.18 49.33-90 49.33Z" />
			<circle cx="305.04" cy="90.37" r="90.37" />
		</svg>
	);
}

export function MicIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2Z" />
			<path d="M4.5 7A.75.75 0 0 0 3 7a5.001 5.001 0 0 0 4.25 4.944V13.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.556A5.001 5.001 0 0 0 13 7a.75.75 0 0 0-1.5 0 3.5 3.5 0 1 1-7 0Z" />
		</svg>
	);
}

export function PlusIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
		</svg>
	);
}

export function AtIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
			<path
				fillRule="evenodd"
				d="M11.89 4.111a5.5 5.5 0 1 0 0 7.778.75.75 0 1 1 1.06 1.061A7 7 0 1 1 15 8a2.5 2.5 0 0 1-4.083 1.935A3.5 3.5 0 1 1 11.5 8a1 1 0 0 0 2 0 5.48 5.48 0 0 0-1.61-3.889ZM10 8a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

interface IntegrationChipProps {
	fill: string;
	kind: "figma" | "linear" | "github";
}

export function IntegrationChip({ fill, kind }: IntegrationChipProps) {
	const label = kind === "figma" ? "F" : kind === "linear" ? "L" : "G";
	return (
		<span
			className="inline-flex items-center justify-center rounded-[4px] overflow-hidden shrink-0"
			style={{
				width: 16,
				height: 16,
				marginRight: -8,
				boxShadow: "#313131 0px 0px 0px 2px",
				background: fill,
			}}
		>
			<span className="text-white text-[9px] font-bold leading-none">
				{label}
			</span>
		</span>
	);
}
