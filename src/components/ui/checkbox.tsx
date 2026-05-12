"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import type * as React from "react";
import { cn } from "#/lib/utils";

interface CheckboxProps
	extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "render"> {
	className?: string;
}

export function Checkbox({ className, ...props }: CheckboxProps) {
	return (
		<CheckboxPrimitive.Root
			{...props}
			className={cn(
				"peer relative size-3.5 shrink-0 rounded-[4px] border border-tw-border bg-tw-inner outline-none transition-colors",
				"hover:border-tw-text-tertiary",
				"focus-visible:ring-2 focus-visible:ring-tw-accent/40 focus-visible:ring-offset-0",
				"data-[checked]:border-tw-accent data-[checked]:bg-tw-accent",
				"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
				"cursor-pointer",
				className,
			)}
		>
			<CheckboxPrimitive.Indicator className="absolute inset-0 flex items-center justify-center text-white">
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
					<path
						d="M2 5.25 4 7.25 8.25 3"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}
