import { HeroStatSparklineGraphic } from "@tripwire/ui/icons/hero-stat-sparkline-graphic"

interface HeroStatProps {
  value: number
}

export function HeroStat({ value }: HeroStatProps) {
  return (
    <div className="relative w-full overflow-clip rounded-2xl border border-[#0000000F] bg-tw-card px-4 pt-2.5 pb-2 shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
      <div className="flex items-center gap-0.5 pb-1">
        <span className="font-['Inter',system-ui,sans-serif] text-[13px] leading-4 font-[520] tracking-[-0.2px] text-tw-text-secondary">
          Slop prevented
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-1">
        <span className="font-['Inter',system-ui,sans-serif] text-[30px] leading-[36px] font-semibold text-[#FFFFFFCC]">
          {value}
        </span>
      </div>
      {/* Sparkline */}
      <div className="absolute inset-y-0 right-0 flex w-1/3 items-center justify-center">
        <HeroStatSparklineGraphic className="h-full w-full" />
      </div>
    </div>
  )
}
