import type { ComponentType } from "react";

export interface DitherProps {
	waveSpeed?: number;
	waveFrequency?: number;
	waveAmplitude?: number;
	waveColor?: [number, number, number];
	colorNum?: number;
	pixelSize?: number;
	disableAnimation?: boolean;
	enableMouseInteraction?: boolean;
	mouseRadius?: number;
}

declare const Dither: ComponentType<DitherProps>;

export default Dither;
