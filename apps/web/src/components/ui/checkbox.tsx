"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import type * as React from "react"
import { cn } from "@tripwire/ui/utils"
import { CheckboxSmCheckIcon } from "#/components/icons/checkbox-sm-check-icon"

interface CheckboxProps extends Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "render"
> {
  className?: string
}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      className={cn(
        "peer relative size-3.5 shrink-0 rounded-[4px] border border-tw-border bg-tw-inner transition-colors outline-none",
        "hover:border-tw-text-tertiary",
        "focus-visible:ring-2 focus-visible:ring-tw-accent/40 focus-visible:ring-offset-0",
        "data-[checked]:border-tw-accent data-[checked]:bg-tw-accent",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        "cursor-pointer",
        className
      )}
    >
      <CheckboxPrimitive.Indicator className="absolute inset-0 flex items-center justify-center text-white">
        <CheckboxSmCheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
