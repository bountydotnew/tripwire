import { TrendArrow } from "../icons/trend-arrow"

interface StatCardProps {
  label: string
  value: number
  trend: number
  showBorder?: boolean
}

export function StatCard({
  label,
  value,
  trend,
  showBorder = true,
}: StatCardProps) {
  return (
    <div
      className={`flex min-w-0 grow flex-col justify-between px-3 pt-2.5 pb-2 md:px-4 ${
        showBorder ? "md:border-r md:border-r-[#0000000F]" : ""
      }`}
    >
      <div className="flex items-center pb-1">
        <span className="font-['Inter',system-ui,sans-serif] text-[13px] leading-4 font-[520] tracking-[-0.2px] text-tw-text-secondary">
          {label}
        </span>
      </div>
      <div className="flex items-end gap-1">
        <span className="font-['Inter',system-ui,sans-serif] text-xl leading-7 font-semibold text-[#FFFFFFCC]">
          {value}
        </span>
        <div className="mb-0.5 flex items-center gap-0.5">
          <TrendArrow />
          <span className="font-['Inter',system-ui,sans-serif] text-[13px] leading-4 font-[520] tracking-[-0.2px] text-tw-success">
            {trend}%
          </span>
        </div>
      </div>
    </div>
  )
}
