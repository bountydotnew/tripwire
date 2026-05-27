"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { ChevronRightIcon } from "lucide-react"
import type * as React from "react"
import { cn } from "./utils"
import { MenuItemCheckIcon } from "./icons/menu-item-check-icon"

export const MenuCreateHandle: typeof MenuPrimitive.createHandle =
  MenuPrimitive.createHandle

export const Menu: typeof MenuPrimitive.Root = MenuPrimitive.Root

export const MenuPortal: typeof MenuPrimitive.Portal = MenuPrimitive.Portal

export const MenuTrigger: typeof MenuPrimitive.Trigger = MenuPrimitive.Trigger

export function MenuPopup({
  children,
  className,
  sideOffset = 4,
  align = "center",
  alignOffset,
  side = "bottom",
  anchor,
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"]
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"]
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"]
  side?: MenuPrimitive.Positioner.Props["side"]
  anchor?: MenuPrimitive.Positioner.Props["anchor"]
}): React.ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50"
        data-slot="menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            "relative flex origin-(--transform-origin) rounded-lg border border-tw-border bg-tw-card text-tw-text-primary shadow-xl outline-none not-[class*='w-']:min-w-32 focus:outline-none",
            className
          )}
          data-slot="menu-popup"
          {...props}
        >
          <div
            className="w-full overflow-y-auto p-1"
            style={{
              maxHeight:
                "min(var(--available-height, calc(100vh - 5rem)), calc(100vh - 5rem))",
            }}
          >
            {children}
          </div>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export const MenuGroup: typeof MenuPrimitive.Group = MenuPrimitive.Group

export function MenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}): React.ReactElement {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 py-1 text-base text-tw-text-primary outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-tw-hover-light data-inset:ps-8 data-[variant=destructive]:text-tw-error sm:min-h-7 sm:text-sm [&>svg]:pointer-events-none [&>svg]:-mx-0.5 [&>svg]:shrink-0 [&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5 sm:[&>svg:not([class*='size-'])]:size-4",
        className
      )}
      data-inset={inset}
      data-slot="menu-item"
      data-variant={variant}
      {...props}
    />
  )
}

export function MenuCheckboxItem({
  className,
  children,
  checked,
  variant = "default",
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  variant?: "default" | "switch"
}): React.ReactElement {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "grid min-h-8 cursor-default items-center gap-2 rounded-sm py-1 ps-2 text-base text-tw-text-primary outline-none in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)] data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-tw-hover-light sm:min-h-7 sm:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
        variant === "switch"
          ? "grid-cols-[1fr_auto] gap-4 pe-1.5"
          : "grid-cols-[.75rem_1fr] pe-4",
        className
      )}
      data-slot="menu-checkbox-item"
      {...props}
    >
      {variant === "switch" ? (
        <>
          <span className="col-start-1">{children}</span>
          <MenuPrimitive.CheckboxItemIndicator
            className="inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)] shrink-0 items-center rounded-full p-px transition-[background-color] duration-200 outline-none [--thumb-size:1rem] focus-visible:ring-2 focus-visible:ring-tw-accent focus-visible:ring-offset-1 focus-visible:ring-offset-tw-bg data-checked:bg-tw-accent data-disabled:opacity-50 data-unchecked:bg-tw-button-muted sm:[--thumb-size:0.75rem]"
            keepMounted
          >
            <span className="pointer-events-none block aspect-square h-full origin-left rounded-(--thumb-size) bg-white shadow-sm will-change-transform [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s] in-[[data-slot=menu-checkbox-item]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.10)] in-[[data-slot=menu-checkbox-item]:active]:not-data-disabled:scale-x-110 in-[[data-slot=menu-checkbox-item][data-checked]]:origin-[var(--thumb-size)_50%] in-[[data-slot=menu-checkbox-item][data-checked]]:translate-x-[calc(var(--thumb-size)-4px)]" />
          </MenuPrimitive.CheckboxItemIndicator>
        </>
      ) : (
        <>
          <MenuPrimitive.CheckboxItemIndicator className="col-start-1 -ms-0.5">
            <MenuItemCheckIcon />
          </MenuPrimitive.CheckboxItemIndicator>
          <span className="col-start-2">{children}</span>
        </>
      )}
    </MenuPrimitive.CheckboxItem>
  )
}

export const MenuRadioGroup: typeof MenuPrimitive.RadioGroup =
  MenuPrimitive.RadioGroup

export function MenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props): React.ReactElement {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        "grid min-h-8 cursor-default grid-cols-[.75rem_1fr] items-center gap-2 rounded-sm py-1 ps-2 pe-4 text-base text-tw-text-primary outline-none in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)] data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-tw-hover-light sm:min-h-7 sm:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-slot="menu-radio-item"
      {...props}
    >
      <MenuPrimitive.RadioItemIndicator className="col-start-1 -ms-0.5">
        <MenuItemCheckIcon />
      </MenuPrimitive.RadioItemIndicator>
      <span className="col-start-2">{children}</span>
    </MenuPrimitive.RadioItem>
  )
}

export function MenuGroupLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}): React.ReactElement {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-tw-text-muted data-inset:ps-9 sm:data-inset:ps-8",
        className
      )}
      data-inset={inset}
      data-slot="menu-label"
      {...props}
    />
  )
}

export function MenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props): React.ReactElement {
  return (
    <MenuPrimitive.Separator
      className={cn("mx-2 my-1 h-px bg-tw-border", className)}
      data-slot="menu-separator"
      {...props}
    />
  )
}

export function MenuShortcut({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "ms-auto font-sans text-xs font-medium tracking-widest text-tw-text-muted/70",
        className
      )}
      data-slot="menu-shortcut"
      {...props}
    />
  )
}

export const MenuSub: typeof MenuPrimitive.SubmenuRoot =
  MenuPrimitive.SubmenuRoot

export function MenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}): React.ReactElement {
  return (
    <MenuPrimitive.SubmenuTrigger
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-sm px-2 py-1 text-base text-tw-text-primary outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-tw-hover-light data-inset:ps-8 data-popup-open:bg-tw-hover-light sm:min-h-7 sm:text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&>svg:not(:last-child)]:-mx-0.5",
        className
      )}
      data-inset={inset}
      data-slot="menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto -me-0.5 opacity-80" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

export function MenuSubPopup({
  className,
  sideOffset = 0,
  alignOffset,
  align = "start",
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"]
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"]
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"]
}): React.ReactElement {
  const defaultAlignOffset = align !== "center" ? -5 : undefined

  return (
    <MenuPopup
      align={align}
      alignOffset={alignOffset ?? defaultAlignOffset}
      className={className}
      data-slot="menu-sub-content"
      side="inline-end"
      sideOffset={sideOffset}
      {...props}
    />
  )
}

export {
  MenuPrimitive,
  MenuCreateHandle as DropdownMenuCreateHandle,
  Menu as DropdownMenu,
  MenuPortal as DropdownMenuPortal,
  MenuTrigger as DropdownMenuTrigger,
  MenuPopup as DropdownMenuContent,
  MenuGroup as DropdownMenuGroup,
  MenuItem as DropdownMenuItem,
  MenuCheckboxItem as DropdownMenuCheckboxItem,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuRadioItem as DropdownMenuRadioItem,
  MenuGroupLabel as DropdownMenuLabel,
  MenuSeparator as DropdownMenuSeparator,
  MenuShortcut as DropdownMenuShortcut,
  MenuSub as DropdownMenuSub,
  MenuSubTrigger as DropdownMenuSubTrigger,
  MenuSubPopup as DropdownMenuSubContent,
}
