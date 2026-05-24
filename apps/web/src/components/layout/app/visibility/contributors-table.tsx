import { useMemo, useState } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { Checkbox } from "@tripwire/ui/checkbox"
import { Button } from "@tripwire/ui/button"
import { ScoreBadge } from "./score-badge"
import { ContributorAvatar } from "./contributor-avatar"
import { formatCompact, formatRelativeTime } from "#/lib/format"

export interface ContributorRow {
  githubUsername: string
  githubUserId: number | null
  avatarUrl: string | null
  score: number
  totalAllows: number
  totalBlocks: number
  totalNearMisses: number
  firstSeenAt: Date
  lastSeenAt: Date
  status: "whitelisted" | "blacklisted" | "normal"
}

export type SortColumn =
  | "score"
  | "lastSeen"
  | "firstSeen"
  | "blocks"
  | "allows"
  | "nearMisses"

interface ContributorsTableProps {
  rows: ContributorRow[]
  sort: SortColumn
  dir: "asc" | "desc"
  onSortChange: (sort: SortColumn, dir: "asc" | "desc") => void
  onRowClick: (username: string) => void
  selection: Record<string, boolean>
  onSelectionChange: (selection: Record<string, boolean>) => void
  isLoading?: boolean
}

const columnHelper = createColumnHelper<ContributorRow>()

const statusLabel = {
  whitelisted: "Whitelisted",
  blacklisted: "Blacklisted",
  normal: "—",
}

const statusStyle = {
  whitelisted:
    "border border-tw-success/20 bg-tw-success/10 text-tw-success",
  blacklisted: "border border-tw-error/20 bg-tw-error/10 text-tw-error",
  normal: "text-tw-text-muted",
}

export function ContributorsTable({
  rows,
  sort,
  dir,
  onSortChange,
  onRowClick,
  selection,
  onSelectionChange,
  isLoading,
}: ContributorsTableProps) {
  const [columnVisibility] = useState({})

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        size: 36,
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={table.getIsAllRowsSelected()}
              indeterminate={
                table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
              }
              onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(!!v)}
              aria-label={`Select ${row.original.githubUsername}`}
            />
          </div>
        ),
      }),
      columnHelper.accessor("githubUsername", {
        header: "Contributor",
        size: 240,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center gap-2.5">
              <ContributorAvatar
                username={r.githubUsername}
                avatarUrl={r.avatarUrl}
                githubUserId={r.githubUserId}
                size="md"
              />
              <span className="text-[13px] font-medium text-tw-text-primary">
                @{r.githubUsername}
              </span>
            </div>
          )
        },
      }),
      columnHelper.accessor("score", {
        header: () => (
          <SortHeader
            label="Score"
            active={sort === "score"}
            dir={dir}
            onClick={() =>
              onSortChange(
                "score",
                sort === "score" && dir === "desc" ? "asc" : "desc"
              )
            }
          />
        ),
        size: 90,
        cell: ({ row }) => <ScoreBadge score={row.original.score} />,
      }),
      columnHelper.accessor("totalAllows", {
        header: () => (
          <SortHeader
            label="Allowed"
            active={sort === "allows"}
            dir={dir}
            onClick={() =>
              onSortChange(
                "allows",
                sort === "allows" && dir === "desc" ? "asc" : "desc"
              )
            }
          />
        ),
        size: 80,
        cell: ({ getValue }) => (
          <span className="text-[12px] tabular-nums text-tw-text-secondary">
            {formatCompact(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("totalBlocks", {
        header: () => (
          <SortHeader
            label="Blocked"
            active={sort === "blocks"}
            dir={dir}
            onClick={() =>
              onSortChange(
                "blocks",
                sort === "blocks" && dir === "desc" ? "asc" : "desc"
              )
            }
          />
        ),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue()
          return (
            <span
              className={`text-[12px] tabular-nums ${v > 0 ? "text-tw-error" : "text-tw-text-secondary"}`}
            >
              {formatCompact(v)}
            </span>
          )
        },
      }),
      columnHelper.accessor("totalNearMisses", {
        header: () => (
          <SortHeader
            label="Near miss"
            active={sort === "nearMisses"}
            dir={dir}
            onClick={() =>
              onSortChange(
                "nearMisses",
                sort === "nearMisses" && dir === "desc" ? "asc" : "desc"
              )
            }
          />
        ),
        size: 90,
        cell: ({ getValue }) => (
          <span className="text-[12px] tabular-nums text-tw-text-secondary">
            {formatCompact(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("lastSeenAt", {
        header: () => (
          <SortHeader
            label="Last seen"
            active={sort === "lastSeen"}
            dir={dir}
            onClick={() =>
              onSortChange(
                "lastSeen",
                sort === "lastSeen" && dir === "desc" ? "asc" : "desc"
              )
            }
          />
        ),
        size: 110,
        cell: ({ getValue }) => (
          <span className="text-[12px] text-tw-text-secondary">
            {formatRelativeTime(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        size: 110,
        cell: ({ getValue }) => {
          const s = getValue()
          if (s === "normal") {
            return <span className="text-[12px] text-tw-text-muted">—</span>
          }
          return (
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyle[s]}`}
            >
              {statusLabel[s]}
            </span>
          )
        },
      }),
    ],
    [sort, dir, onSortChange]
  )

  const rowSelection: RowSelectionState = selection

  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection, columnVisibility },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater
      onSelectionChange(next)
    },
    getRowId: (r) => r.githubUsername,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-clip rounded-2xl border border-tw-border bg-tw-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-tw-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.column.columnDef.size }}
                    className="px-3 py-2.5 text-[11px] font-medium tracking-wide text-tw-text-muted uppercase"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-[13px] text-tw-text-muted"
                >
                  No contributors match your filters.
                </td>
              </tr>
            )}
            {isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-[13px] text-tw-text-muted"
                >
                  Loading…
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick(row.original.githubUsername)}
                className="cursor-pointer border-b border-tw-border/50 transition-colors last:border-b-0 hover:bg-tw-hover"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="-mx-1.5 h-6 px-1.5 text-[11px] font-medium tracking-wide text-tw-text-muted uppercase hover:bg-tw-hover"
    >
      {label}
      {active ? (
        <span className="ml-1 text-tw-text-primary">
          {dir === "desc" ? "↓" : "↑"}
        </span>
      ) : null}
    </Button>
  )
}

