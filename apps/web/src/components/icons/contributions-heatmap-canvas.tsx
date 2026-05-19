import { memo } from "react"

export interface HeatmapCell {
  key: string
  x: number
  y: number
  fill: string
  count: number
  date: string
}

export const ContributionsHeatmapCanvas = memo(
  function ContributionsHeatmapCanvas({
    width,
    height,
    cells,
    onMouseMove,
    onMouseLeave,
    svgRef,
  }: {
    width: number
    height: number
    cells: HeatmapCell[]
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void
    onMouseLeave: () => void
    svgRef: React.RefObject<SVGSVGElement | null>
  }) {
    return (
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block shrink-0"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {cells.map((c) => (
          <rect
            key={c.key}
            x={c.x}
            y={c.y}
            width={12}
            height={12}
            rx={3}
            ry={3}
            fill={c.fill}
          />
        ))}
      </svg>
    )
  }
)

ContributionsHeatmapCanvas.displayName = "ContributionsHeatmapCanvas"
