import { useState, useRef, useEffect } from "react"
import { Button } from "#/components/ui/button"
import { DropdownChevronDownIcon10 } from "#/components/icons/app-chrome-icons"

interface RuleDropdownProps {
  value: string
  options?: string[]
  onChange?: (value: string) => void
}

export function RuleDropdown({ value, options, onChange }: RuleDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  return (
    <span className="relative inline-flex" ref={ref} data-dropdown>
      <Button
        variant="ghost"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          options && onChange && setOpen(!open)
        }}
        className="inline-flex h-[22px] cursor-pointer items-center gap-2 rounded-[10px] border border-[#353434] bg-[oklch(26.4%_0_0)] px-[5px]"
      >
        <span className="text-center text-xs font-medium text-white">
          {value}
        </span>
        <DropdownChevronDownIcon10 />
      </Button>
      {open && options && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-[80px] rounded-lg border border-[#353434] bg-[#2a2a2a] py-1 shadow-lg">
          {options.map((opt) => (
            <Button
              variant="ghost"
              key={opt}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange?.(opt)
                setOpen(false)
              }}
              className={`w-full cursor-pointer border-none bg-transparent px-3 py-1.5 text-left text-xs text-white hover:bg-[#353434] ${
                opt === value ? "font-medium" : ""
              }`}
            >
              {opt}
            </Button>
          ))}
        </div>
      )}
    </span>
  )
}
