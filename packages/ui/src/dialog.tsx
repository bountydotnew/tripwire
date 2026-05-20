"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { XIcon } from "lucide-react"
import type React from "react"
import { cn } from "./utils"
import { Button } from "./button"
import { ScrollArea } from "./scroll-area"

export const DialogCreateHandle: typeof DialogPrimitive.createHandle =
  DialogPrimitive.createHandle

export const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root

export const DialogPortal: typeof DialogPrimitive.Portal =
  DialogPrimitive.Portal

export function DialogTrigger(
  props: DialogPrimitive.Trigger.Props
): React.ReactElement {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

export function DialogClose(
  props: DialogPrimitive.Close.Props
): React.ReactElement {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

export function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className
      )}
      data-slot="dialog-backdrop"
      {...props}
    />
  )
}

export function DialogViewport({
  className,
  ...props
}: DialogPrimitive.Viewport.Props): React.ReactElement {
  return (
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
        className
      )}
      data-slot="dialog-viewport"
      {...props}
    />
  )
}

export function DialogPopup({
  className,
  children,
  showCloseButton = true,
  bottomStickOnMobile = true,
  closeProps,
  portalProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  bottomStickOnMobile?: boolean
  closeProps?: DialogPrimitive.Close.Props
  portalProps?: DialogPrimitive.Portal.Props
}): React.ReactElement {
  return (
    <DialogPortal {...portalProps}>
      <DialogBackdrop />
      <DialogViewport
        className={cn(
          bottomStickOnMobile &&
            "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12"
        )}
      >
        <DialogPrimitive.Popup
          className={cn(
            "relative row-start-2 flex max-h-full min-h-0 w-full max-w-lg min-w-0 origin-center flex-col rounded-xl border border-tw-border bg-tw-surface text-tw-text-primary shadow-2xl transition-[scale,opacity,translate] duration-200 ease-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 sm:data-ending-style:scale-95 sm:data-starting-style:scale-95",
            bottomStickOnMobile &&
              "max-sm:max-w-none max-sm:origin-bottom max-sm:rounded-none max-sm:rounded-t-xl max-sm:border-x-0 max-sm:border-b-0 max-sm:data-ending-style:translate-y-4 max-sm:data-starting-style:translate-y-4",
            className
          )}
          data-slot="dialog-popup"
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute end-3 top-3"
              render={<Button size="icon" variant="ghost" />}
              {...closeProps}
            >
              <XIcon className="size-4 text-tw-text-muted" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogViewport>
    </DialogPortal>
  )
}

export function DialogHeader({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn(
      "flex flex-col gap-1.5 px-5 pt-5 pb-4 in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pb-2",
      className
    ),
    "data-slot": "dialog-header",
  }

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  })
}

export function DialogFooter({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  variant?: "default" | "bare"
}): React.ReactElement {
  const defaultProps = {
    className: cn(
      "flex flex-col-reverse gap-2 px-5 sm:flex-row sm:justify-end",
      variant === "default" && "border-t border-tw-border bg-tw-bg/50 py-4 rounded-b-xl",
      variant === "bare" && "pt-2 pb-5 in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pt-2",
      className
    ),
    "data-slot": "dialog-footer",
  }

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  })
}

export function DialogTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props): React.ReactElement {
  return (
    <DialogPrimitive.Title
      className={cn(
        "text-[15px] leading-tight font-semibold text-tw-text-primary",
        className
      )}
      data-slot="dialog-title"
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props): React.ReactElement {
  return (
    <DialogPrimitive.Description
      className={cn("text-[13px] leading-relaxed text-tw-text-muted", className)}
      data-slot="dialog-description"
      {...props}
    />
  )
}

export function DialogPanel({
  className,
  scrollFade = true,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  scrollFade?: boolean
}): React.ReactElement {
  const defaultProps = {
    className: cn(
      "px-5 py-4 in-[[data-slot=dialog-popup]:has([data-slot=dialog-footer]:not(.border-t))]:pb-1 in-[[data-slot=dialog-popup]:has([data-slot=dialog-header])]:pt-0",
      className
    ),
    "data-slot": "dialog-panel",
  }

  return (
    <ScrollArea scrollFade={scrollFade}>
      {useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
      })}
    </ScrollArea>
  )
}

export {
  DialogPrimitive,
  DialogBackdrop as DialogOverlay,
  DialogPopup as DialogContent,
}
