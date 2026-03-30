// ─── Rule Visualizations ─────────────────────────────────────

export function AiSlopViz() {
	// Stacked text lines, two highlighted as flagged with left accent bar
	const lines = [
		{ y: 8, w: 40, flagged: false },
		{ y: 17, w: 34, flagged: false },
		{ y: 26, w: 46, flagged: true },
		{ y: 35, w: 30, flagged: false },
		{ y: 44, w: 38, flagged: true },
	];
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{lines.map((l, i) => (
				<g key={i}>
					<rect x="10" y={l.y} width={l.w} height="4" rx="2"
						fill={l.flagged ? "rgba(52,166,255,0.12)" : "rgba(255,255,255,0.07)"} />
					{l.flagged && (
						<rect x="5" y={l.y} width="2" height="4" rx="1" fill="#34A6FF" opacity="0.5" />
					)}
				</g>
			))}
			{/* vertical scan line */}
			<line x1="62" y1="4" x2="62" y2="52" stroke="rgba(52,166,255,0.12)" strokeWidth="1" strokeDasharray="2 3" />
			<circle cx="62" cy="28" r="2" fill="#34A6FF" opacity="0.3" />
		</svg>
	);
}

export function ProfilePictureViz() {
	// 2×3 avatar grid, properly centered badges
	const S = 16;
	const avatars = [
		{ x: 8, y: 10, real: true },
		{ x: 28, y: 10, real: false },
		{ x: 48, y: 10, real: true },
		{ x: 8, y: 30, real: true },
		{ x: 28, y: 30, real: true },
		{ x: 48, y: 30, real: false },
	];
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{avatars.map((a, i) => {
				const cx = a.x + S / 2;
				const cy = a.y + S / 2;
				return (
					<g key={i}>
						<rect x={a.x} y={a.y} width={S} height={S} rx="4"
							fill={a.real ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"} />
						{a.real ? (
							<>
								{/* person silhouette centered */}
								<circle cx={cx} cy={cy - 2} r="2.5" fill="rgba(255,255,255,0.12)" />
								<path d={`M${cx - 4} ${cy + 6} Q${cx - 4} ${cy + 2} ${cx} ${cy + 2} Q${cx + 4} ${cy + 2} ${cx + 4} ${cy + 6}`}
									fill="rgba(255,255,255,0.08)" />
								{/* badge: bottom-right corner of the square */}
								<circle cx={a.x + S - 1} cy={a.y + S - 1} r="3.5" fill="#262525" />
								<circle cx={a.x + S - 1} cy={a.y + S - 1} r="2.5" fill="rgba(52,166,255,0.35)" />
								<path d={`M${a.x + S - 2.8} ${a.y + S - 1} l1.2 1.2 2.2-2.2`}
									stroke="#34A6FF" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
							</>
						) : (
							<>
								{/* empty silhouette */}
								<circle cx={cx} cy={cy - 2} r="2.5" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" fill="none" />
								<path d={`M${cx - 4} ${cy + 6} Q${cx - 4} ${cy + 2} ${cx} ${cy + 2} Q${cx + 4} ${cy + 2} ${cx + 4} ${cy + 6}`}
									stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" fill="none" />
								{/* ✕ centered in square */}
								<path d={`M${cx - 2.5} ${cy - 2.5} l5 5 m-5 0 l5-5`}
									stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" />
							</>
						)}
					</g>
				);
			})}
		</svg>
	);
}

export function LanguageViz() {
	// Chat bubbles — accepted ones are normal, rejected ones are dimmed with a block icon
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{/* Accepted bubble: "Hello world" — left aligned */}
			<rect x="6" y="6" width="40" height="14" rx="4" fill="rgba(255,255,255,0.07)" />
			<rect x="12" y="11" width="22" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
			<text x="38" y="16" fontFamily="ui-monospace, monospace" fontSize="5" fill="rgba(52,166,255,0.4)">EN</text>

			{/* Rejected bubble: foreign text — right aligned, dimmed */}
			<rect x="26" y="24" width="40" height="14" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
			<rect x="32" y="29" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.04)" />
			<text x="53" y="34" fontFamily="ui-monospace, monospace" fontSize="5" fill="rgba(255,255,255,0.1)">ZH</text>
			{/* block icon centered on rejected bubble */}
			<circle cx="42" cy="31" r="4" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" fill="none" />
			<line x1="39.2" y1="33.8" x2="44.8" y2="28.2" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />

			{/* Accepted bubble */}
			<rect x="6" y="42" width="36" height="10" rx="4" fill="rgba(255,255,255,0.07)" />
			<rect x="12" y="45.5" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
			<text x="34" y="50" fontFamily="ui-monospace, monospace" fontSize="5" fill="rgba(52,166,255,0.4)">EN</text>
		</svg>
	);
}

export function MergedPrsViz() {
	// Vertical bars with a dashed threshold line. Bars below = dim, above = accent.
	const bars = [
		{ x: 6, h: 8 },
		{ x: 16, h: 16 },
		{ x: 26, h: 28 },
		{ x: 36, h: 40 },
		{ x: 46, h: 20 },
		{ x: 56, h: 10 },
	];
	const baseline = 50;
	const thresholdH = 22;
	const thresholdY = baseline - thresholdH;

	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{bars.map((b, i) => {
				const y = baseline - b.h;
				const above = b.h >= thresholdH;
				return (
					<rect key={i} x={b.x} y={y} width="7" height={b.h} rx="1.5"
						fill={above ? "rgba(52,166,255,0.15)" : "rgba(255,255,255,0.05)"} />
				);
			})}
			{/* threshold line */}
			<line x1="2" y1={thresholdY} x2="70" y2={thresholdY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 3" />
		</svg>
	);
}

export function AccountAgeViz() {
	// Timeline: a horizontal track with day markers, a cutoff point, and a "too new" zone
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{/* track */}
			<line x1="8" y1="28" x2="64" y2="28" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeLinecap="round" />

			{/* day tick marks */}
			{[8, 16, 24, 32, 40, 48, 56, 64].map((x, i) => (
				<line key={i} x1={x} y1="25" x2={x} y2="31" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
			))}

			{/* "too new" zone — left side, shaded */}
			<rect x="8" y="22" width="32" height="12" rx="2" fill="rgba(255,255,255,0.03)" />

			{/* cutoff marker at day 30 */}
			<line x1="40" y1="16" x2="40" y2="40" stroke="rgba(52,166,255,0.25)" strokeWidth="1" strokeDasharray="2 2" />
			<circle cx="40" cy="28" r="3" fill="#262525" stroke="#34A6FF" strokeWidth="1" opacity="0.5" />

			{/* labels */}
			<text x="20" y="44" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="5.5" fill="rgba(255,255,255,0.1)">new</text>
			<text x="54" y="44" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="5.5" fill="rgba(255,255,255,0.12)">30d+</text>
		</svg>
	);
}

export function MaxPrsPerDayViz() {
	// Tally marks with a cap line — simple counter hitting a ceiling
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{/* tally marks — groups of 5 */}
			{[0, 1, 2, 3].map((i) => (
				<line key={`t${i}`} x1={12 + i * 6} y1="16" x2={12 + i * 6} y2="36"
					stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeLinecap="round" />
			))}
			{/* diagonal cross for group of 5 */}
			<line x1="10" y1="34" x2="38" y2="18" stroke="rgba(255,255,255,0.1)" strokeWidth="1.2" strokeLinecap="round" />

			{/* second group — dimmer, approaching limit */}
			{[0, 1, 2].map((i) => (
				<line key={`t2${i}`} x1={44 + i * 6} y1="16" x2={44 + i * 6} y2="36"
					stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeLinecap="round" />
			))}

			{/* cap line */}
			<line x1="6" y1="42" x2="66" y2="42" stroke="rgba(52,166,255,0.2)" strokeWidth="1" strokeDasharray="3 3" />
			<text x="36" y="50" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="5" fill="rgba(52,166,255,0.3)">limit</text>
		</svg>
	);
}

export function MaxFilesChangedViz() {
	// File tree with a count badge — some files highlighted as "too many"
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{/* folder icon */}
			<path d="M8 12 h10 l3 -4 h14 a2 2 0 0 1 2 2 v4" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" fill="rgba(255,255,255,0.03)" />
			<rect x="8" y="14" width="29" height="18" rx="2" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />

			{/* file rows inside */}
			<rect x="12" y="18" width="14" height="2.5" rx="1" fill="rgba(255,255,255,0.08)" />
			<rect x="12" y="22.5" width="18" height="2.5" rx="1" fill="rgba(52,166,255,0.12)" />
			<rect x="12" y="27" width="10" height="2.5" rx="1" fill="rgba(52,166,255,0.12)" />

			{/* more files stacked behind */}
			<rect x="42" y="10" width="20" height="14" rx="2" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
			<rect x="45" y="14" width="10" height="2" rx="1" fill="rgba(52,166,255,0.1)" />
			<rect x="45" y="18" width="14" height="2" rx="1" fill="rgba(52,166,255,0.1)" />

			<rect x="46" y="28" width="20" height="14" rx="2" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
			<rect x="49" y="32" width="12" height="2" rx="1" fill="rgba(52,166,255,0.1)" />
			<rect x="49" y="36" width="8" height="2" rx="1" fill="rgba(52,166,255,0.1)" />

			{/* count badge */}
			<circle cx="58" cy="46" r="7" fill="#262525" />
			<circle cx="58" cy="46" r="5.5" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
			<text x="58" y="48.5" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="6" fontWeight="500" fill="rgba(255,255,255,0.25)">42</text>
		</svg>
	);
}

export function RepoActivityViz() {
	// GitHub-style contribution grid — sparse activity pattern
	const cols = 9;
	const rows = 4;
	const active = [2, 5, 10, 11, 14, 18, 19, 20, 23, 25, 27, 29, 30, 31, 33, 34, 35];
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{Array.from({ length: rows }).map((_, r) =>
				Array.from({ length: cols }).map((_, c) => {
					const idx = r * cols + c;
					const isActive = active.includes(idx);
					return (
						<rect
							key={idx}
							x={6 + c * 7}
							y={8 + r * 7}
							width="5"
							height="5"
							rx="1"
							fill={isActive ? "rgba(52,166,255,0.15)" : "rgba(255,255,255,0.03)"}
						/>
					);
				})
			)}
			{/* label */}
			<text x="36" y="50" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="5" fill="rgba(255,255,255,0.1)">activity</text>
		</svg>
	);
}

export function ProfileReadmeViz() {
	// Profile card with a "README.md" document preview
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{/* avatar circle */}
			<circle cx="18" cy="20" r="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
			<circle cx="18" cy="18" r="3" fill="rgba(255,255,255,0.08)" />
			<path d="M12 26 Q12 22 18 22 Q24 22 24 26" fill="rgba(255,255,255,0.06)" />

			{/* name placeholder */}
			<rect x="30" y="15" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
			<rect x="30" y="21" width="14" height="2.5" rx="1" fill="rgba(255,255,255,0.05)" />

			{/* README document below */}
			<rect x="8" y="34" width="56" height="18" rx="2.5" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />

			{/* "README.md" label */}
			<text x="14" y="40" fontFamily="ui-monospace, monospace" fontSize="4.5" fontWeight="500" fill="rgba(52,166,255,0.35)">README.md</text>

			{/* text lines inside readme */}
			<rect x="14" y="43" width="28" height="2" rx="1" fill="rgba(255,255,255,0.06)" />
			<rect x="14" y="47" width="38" height="2" rx="1" fill="rgba(255,255,255,0.04)" />

			{/* checkmark badge */}
			<circle cx="60" cy="36" r="5" fill="#262525" />
			<circle cx="60" cy="36" r="3.5" fill="rgba(52,166,255,0.2)" stroke="#34A6FF" strokeWidth="0.7" opacity="0.6" />
			<path d="M58.5 36 l1.2 1.2 2.2-2.2" stroke="#34A6FF" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
		</svg>
	);
}

export function CryptoViz() {
	// Wallet address fragments with a "blocked" indicator
	const lines = [
		{ y: 10, text: "0x1a2B...f9E0", flagged: true },
		{ y: 22, text: "bc1qxy2...m8k", flagged: false },
		{ y: 34, text: "3J98t1W...vhX", flagged: true },
		{ y: 46, text: "4Adun...Zx7p", flagged: false },
	];
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			{lines.map((l, i) => (
				<g key={i}>
					<rect x="8" y={l.y - 3} width="50" height="8" rx="2"
						fill={l.flagged ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)"} />
					<text x="12" y={l.y + 3} fontSize="5" fontFamily="monospace"
						fill={l.flagged ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.15)"}>
						{l.text}
					</text>
					{l.flagged && (
						<>
							<line x1="56" y1={l.y - 1} x2="62" y2={l.y + 3}
								stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeLinecap="round" />
							<line x1="62" y1={l.y - 1} x2="56" y2={l.y + 3}
								stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeLinecap="round" />
						</>
					)}
				</g>
			))}
		</svg>
	);
}
