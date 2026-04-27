interface NavIconProps {
	active?: boolean;
}

export function HomeNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "rgba(159, 159, 169, 1)";
	return (
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none">
			<path d="M9.44642 1.14733C9.18122 0.950889 8.81878 0.950889 8.55358 1.14733L2.20858 5.84733C1.76278 6.17775 1.5 6.69936 1.5 7.254V13.75C1.5 15.2692 2.73079 16.5 4.25 16.5H13.75C15.2692 16.5 16.5 15.2692 16.5 13.75V7.254C16.5 6.69936 16.2374 6.17787 15.7916 5.84746L9.44642 1.14733Z" fill={c} fillOpacity={active ? "1" : "0.4"} />
			<path d="M14.5 4.89072L13 3.77961V2.75C13 2.33579 13.3358 2 13.75 2C14.1642 2 14.5 2.33579 14.5 2.75V4.89072Z" fill={c} />
			<path d="M9 16.5V12C9 10.8954 8.10457 10 7 10C5.89543 10 5 10.8954 5 12V16.5H9Z" fill={c} />
			<path fillRule="evenodd" clipRule="evenodd" d="M10 9.75C10 9.33579 10.3358 9 10.75 9H12.25C12.6642 9 13 9.33579 13 9.75C13 10.1642 12.6642 10.5 12.25 10.5H10.75C10.3358 10.5 10 10.1642 10 9.75Z" fill={c} />
		</svg>
	);
}

export function RulesNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "#9F9FA9";
	return (
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none">
			<path d="M14.783,2.813l-5.25-1.68c-.349-.112-.718-.111-1.066,0L3.216,2.813c-.728,.233-1.216,.903-1.216,1.667v6.52c0,3.508,4.946,5.379,6.46,5.869,.177,.057,.358,.086,.54,.086s.362-.028,.538-.085c1.516-.49,6.462-2.361,6.462-5.869V4.48c0-.764-.489-1.434-1.217-1.667Zm-2.681,4.389l-3.397,4.5c-.128,.169-.322,.276-.534,.295-.021,.002-.043,.003-.065,.003-.189,0-.372-.071-.511-.201l-1.609-1.5c-.303-.283-.32-.757-.038-1.06,.284-.303,.758-.319,1.06-.038l1.001,.933,2.896-3.836c.25-.33,.72-.396,1.051-.146,.331,.25,.396,.72,.146,1.051Z" fill={c} />
		</svg>
	);
}

export function InsightsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "rgba(159, 159, 169, 1)";
	return (
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none">
			<rect x="12.5" y="2" width="4" height="14" rx="1.75" ry="1.75" fill={c} />
			<rect x="7" y="7" width="4" height="9" rx="1.75" ry="1.75" fill={c} />
			<rect x="1.5" y="11" width="4" height="5" rx="1.75" ry="1.75" fill={c} />
			<path d="M2.75,9.5c.192,0,.384-.073,.53-.22l4.72-4.72v.689c0,.414,.336,.75,.75,.75s.75-.336,.75-.75V2.75c0-.414-.336-.75-.75-.75h-2.5c-.414,0-.75,.336-.75,.75s.336,.75,.75,.75h.689L2.22,8.22c-.293,.293-.293,.768,0,1.061,.146,.146,.338,.22,.53,.22Z" fill={c} />
		</svg>
	);
}

export function WorkflowsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "rgba(159, 159, 169, 1)";
	return (
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none">
			<path fillRule="evenodd" clipRule="evenodd" d="M9.75 5.25C9.75 4.83579 9.41421 4.5 9 4.5C8.58579 4.5 8.25 4.83579 8.25 5.25V8H6.75C5.23079 8 4 9.23079 4 10.75V12.75C4 13.1642 4.33579 13.5 4.75 13.5C5.16421 13.5 5.5 13.1642 5.5 12.75V10.75C5.5 10.0592 6.05921 9.5 6.75 9.5H9H11.25C11.9408 9.5 12.5 10.0592 12.5 10.75V12.75C12.5 13.1642 12.8358 13.5 13.25 13.5C13.6642 13.5 14 13.1642 14 12.75V10.75C14 9.23079 12.7692 8 11.25 8H9.75V5.25Z" fill={c} fillOpacity="0.4" />
			<path fillRule="evenodd" clipRule="evenodd" d="M6.5 2.75C6.5 1.78379 7.28379 1 8.25 1H9.75C10.7162 1 11.5 1.78379 11.5 2.75V4.25C11.5 5.21621 10.7162 6 9.75 6H8.25C7.28379 6 6.5 5.21621 6.5 4.25V2.75Z" fill={c} />
			<path fillRule="evenodd" clipRule="evenodd" d="M10.75 13.75C10.75 12.7838 11.5338 12 12.5 12H14C14.9662 12 15.75 12.7838 15.75 13.75V15.25C15.75 16.2162 14.9662 17 14 17H12.5C11.5338 17 10.75 16.2162 10.75 15.25V13.75Z" fill={c} />
			<path fillRule="evenodd" clipRule="evenodd" d="M2.25 13.75C2.25 12.7838 3.03379 12 4 12H5.5C6.46621 12 7.25 12.7838 7.25 13.75V15.25C7.25 16.2162 6.46621 17 5.5 17H4C3.03379 17 2.25 16.2162 2.25 15.25V13.75Z" fill={c} />
		</svg>
	);
}

export function EventsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "rgba(159, 159, 169, 1)";
	return (
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none">
			<path d="M14.5 5.75C15.743 5.75 16.75 4.743 16.75 3.5C16.75 2.257 15.743 1.25 14.5 1.25C13.257 1.25 12.25 2.257 12.25 3.5C12.25 4.743 13.257 5.75 14.5 5.75Z" fill={c} />
			<path d="M10.8847 2.5H4.25L4.23221 2.50006C2.72119 2.50962 1.5 3.73672 1.5 5.25V13.75C1.5 15.2692 2.73079 16.5 4.25 16.5H12.75C14.2692 16.5 15.5 15.2692 15.5 13.75V7.11525C15.1817 7.20308 14.8463 7.25 14.5 7.25C12.4286 7.25 10.75 5.57143 10.75 3.5C10.75 3.15368 10.7969 2.81835 10.8847 2.5Z" fill={c} fillOpacity="0.4" />
		</svg>
	);
}

export function IntegrationsNavIcon({ active }: NavIconProps) {
	const c = active ? "#FAFAFA" : "rgba(159, 159, 169, 1)";
	return (
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none">
			<path d="M9.47,9.97l-1.025,1.025-1.439-1.44,1.025-1.025c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0l-1.025,1.025-.311-.311c-.682-.683-1.793-.683-2.475,0l-.28,.28c-.89,.889-1.379,2.071-1.379,3.328,0,1.003,.323,1.95,.9,2.747l-1.181,1.181c-.293,.293-.293,.768,0,1.061,.146,.146,.338,.22,.53,.22s.384-.073,.53-.22l1.181-1.181c.796,.577,1.743,.9,2.746,.9,1.258,0,2.439-.49,3.328-1.379l.28-.28c.683-.682,.683-1.792,0-2.475l-.311-.311,1.025-1.025c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0Z" fill={c} />
			<path d="M15.72,1.22l-1.181,1.181c-.796-.577-1.743-.9-2.746-.9-1.258,0-2.439,.49-3.328,1.379l-.28,.28c-.683,.682-.683,1.792,0,2.475l4.182,4.182c.341,.341,.789,.512,1.237,.512s.896-.17,1.237-.512l.28-.28c.89-.889,1.379-2.071,1.379-3.328,0-1.003-.323-1.95-.9-2.747l1.181-1.181c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0Z" fill={c} />
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
