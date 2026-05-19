import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

const easeOut = [0.23, 1, 0.32, 1] as const

function SlopDetection() {
  const lines = [
    { text: "fix: resolve race condition in pool", bad: false },
    { text: "refactor: extract auth middleware", bad: false },
    { text: "As an AI language model, I can", bad: true },
    { text: "feat: add rate limiting to /api", bad: false },
    { text: "Certainly! Here is a comprehen", bad: true },
    { text: "fix: edge case in parser.ts", bad: false },
  ]
  const [cursor, setCursor] = useState(-1)

  useEffect(() => {
    let i = -1
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      i++
      if (i >= lines.length) {
        timer = setTimeout(() => {
          i = -1
          setCursor(-1)
          timer = setTimeout(step, 600)
        }, 2000)
        return
      }
      setCursor(i)
      timer = setTimeout(step, 500)
    }
    timer = setTimeout(step, 400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((l, i) => {
        const scanned = i <= cursor
        const hit = scanned && l.bad
        const scanning = i === cursor
        return (
          <motion.div
            key={i}
            className="flex items-center gap-2.5 px-2 py-1.5"
            animate={{
              borderLeftColor: hit
                ? "rgba(255,255,255,0.25)"
                : scanning
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0)",
            }}
            style={{ borderLeftWidth: 1.5, borderLeftStyle: "solid" }}
            transition={{ duration: 0.18, ease: easeOut }}
          >
            <motion.span
              className={`overflow-hidden font-mono text-xs leading-5 text-ellipsis whitespace-nowrap ${hit ? "line-through" : ""}`}
              animate={{
                color: hit
                  ? "rgba(255,255,255,0.15)"
                  : scanned
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(255,255,255,0.13)",
              }}
              transition={{ duration: 0.2, ease: easeOut }}
            >
              {l.text}
            </motion.span>
          </motion.div>
        )
      })}
    </div>
  )
}

function ProfilePicture() {
  const items = [
    { real: true, img: "https://avatars.githubusercontent.com/u/75869731?v=4" },
    { real: false, img: "https://avatars.githubusercontent.com/u/200853?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/13007539?v=4" },
    {
      real: true,
      img: "https://avatars.githubusercontent.com/u/140507264?v=4",
    },
    { real: false, img: "https://avatars.githubusercontent.com/u/423536?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/14241866?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/68947960?v=4" },
    { real: false, img: "https://avatars.githubusercontent.com/u/1002943?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/6751787?v=4" },
  ]
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it, i) => {
        const isHov = hovered === i
        return (
          <motion.div
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="relative h-10 w-10 cursor-default overflow-hidden rounded"
            animate={{
              borderColor: isHov
                ? it.real
                  ? "rgba(255,255,255,0.18)"
                  : "rgba(255,255,255,0.12)"
                : "#2a2a2a",
              scale: isHov ? 1.04 : 1,
              opacity: !it.real && !isHov ? 0.45 : 1,
            }}
            style={{ borderWidth: 1, borderStyle: "solid" }}
            transition={{ duration: 0.16, ease: easeOut }}
          >
            <img
              src={`${it.img}&s=80`}
              alt=""
              className={`block h-full w-full object-cover ${!it.real ? "grayscale" : ""}`}
            />
            <AnimatePresence>
              {isHov && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: easeOut }}
                  className={`absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-sm ${it.real ? "bg-[#333]" : "bg-[#2a2a2a]"}`}
                  style={{ border: "1.5px solid #1b1b1b" }}
                >
                  <span
                    className={`text-[7px] leading-none font-semibold ${it.real ? "text-white/70" : "text-white/30"}`}
                  >
                    {it.real ? "✓" : "✕"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {!it.real && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)",
                }}
              />
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function LanguageGate() {
  const [lang, setLang] = useState("en")
  const data: Record<string, { t: string; ok: boolean }[]> = {
    en: [
      { t: "fix: resolve race condition", ok: true },
      { t: "修复数据库连接池泄漏问题", ok: false },
      { t: "feat: add retry with backoff", ok: true },
      { t: "corriger le bug de pagination", ok: false },
    ],
    es: [
      { t: "fix: resolve race condition", ok: false },
      { t: "corregir error de validación", ok: true },
      { t: "añadir pruebas unitarias", ok: true },
      { t: "修复数据库连接池泄漏问题", ok: false },
    ],
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-0.5">
        {["en", "es"].map((l) => (
          <motion.button
            key={l}
            onClick={() => setLang(l)}
            className="cursor-pointer rounded px-3 py-1 font-mono text-[11px] font-medium tracking-wide uppercase outline-none"
            animate={{
              borderColor: lang === l ? "#3a3a3a" : "#2a2a2a",
              backgroundColor: lang === l ? "#262525" : "rgba(0,0,0,0)",
              color:
                lang === l ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
            }}
            whileTap={{ scale: 0.97 }}
            style={{ borderWidth: 1, borderStyle: "solid" }}
            transition={{ duration: 0.16, ease: easeOut }}
          >
            {l}
          </motion.button>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <AnimatePresence mode="wait">
          {data[lang].map((s, i) => (
            <motion.div
              key={`${lang}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: easeOut, delay: i * 0.05 }}
              className="flex items-center gap-2 px-2 py-1"
              style={{
                borderLeftWidth: 1.5,
                borderLeftStyle: "solid",
                borderLeftColor: s.ok
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.12)",
              }}
            >
              <span
                className={`overflow-hidden font-mono text-[11.5px] text-ellipsis whitespace-nowrap ${s.ok ? "text-white/40" : "text-white/15 line-through"}`}
              >
                {s.t}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function PRThreshold() {
  const [min, setMin] = useState(5)
  const users = [
    { n: "alice", v: 12 },
    { n: "bob", v: 3 },
    { n: "charlie", v: 8 },
    { n: "newbie", v: 1 },
    { n: "diana", v: 5 },
    { n: "eve", v: 0 },
  ]
  const maxV = 12

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-wide text-white/[0.18] uppercase">
          min
        </span>
        <input
          type="range"
          min={0}
          max={10}
          value={min}
          onChange={(e) => setMin(Number(e.target.value))}
          className="h-px flex-1 cursor-pointer appearance-none rounded-sm bg-[#262525] outline-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-[#1b1b1b] [&::-webkit-slider-thumb]:bg-white/35"
        />
        <span className="min-w-4 text-right font-mono text-[15px] font-medium text-white/70 tabular-nums">
          {min}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {users.map((u) => {
          const ok = u.v >= min
          return (
            <div key={u.n} className="flex items-center gap-2">
              <motion.span
                className="w-13 font-mono text-[11px]"
                animate={{
                  color: ok
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(255,255,255,0.13)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {u.n}
              </motion.span>
              <div className="relative h-0.5 flex-1 overflow-visible rounded-sm bg-[#262525]">
                <motion.div
                  className="h-full rounded-sm"
                  style={{ width: `${(u.v / maxV) * 100}%` }}
                  animate={{
                    backgroundColor: ok
                      ? "rgba(255,255,255,0.22)"
                      : "rgba(255,255,255,0.06)",
                  }}
                  transition={{ duration: 0.2, ease: easeOut }}
                />
                <motion.div
                  className="absolute -top-1 h-2.5 w-px bg-white/[0.12]"
                  animate={{ left: `${(min / maxV) * 100}%` }}
                  transition={{ duration: 0.2, ease: easeOut }}
                />
              </div>
              <motion.span
                className="w-3.5 text-right font-mono text-[10px]"
                animate={{
                  color: ok
                    ? "rgba(255,255,255,0.35)"
                    : "rgba(255,255,255,0.1)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {u.v}
              </motion.span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AccountAge() {
  const [day, setDay] = useState(0)
  const limit = 30

  useEffect(() => {
    const interval = setInterval(
      () => setDay((p) => (p >= 36 ? 0 : p + 1)),
      100
    )
    return () => clearInterval(interval)
  }, [])

  const capped = Math.min(day, limit)
  const blocked = day < limit
  const pct = (capped / limit) * 100

  return (
    <div className="flex w-full flex-col gap-3.5">
      <div className="flex items-baseline gap-1.5">
        <motion.span
          className="font-mono text-[28px] leading-none font-medium tabular-nums"
          animate={{
            color: blocked ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.65)",
          }}
          transition={{ duration: 0.18, ease: easeOut }}
        >
          {capped}
        </motion.span>
        <span className="font-mono text-[11px] text-white/[0.12]">
          / {limit}d
        </span>
      </div>
      <div className="h-0.5 w-full overflow-hidden rounded-sm bg-[#262525]">
        <motion.div
          className="h-full rounded-sm"
          animate={{
            width: `${pct}%`,
            backgroundColor: blocked
              ? "rgba(255,255,255,0.1)"
              : "rgba(255,255,255,0.25)",
          }}
          transition={{
            width: { duration: 0.1, ease: "linear" },
            backgroundColor: { duration: 0.18, ease: easeOut },
          }}
        />
      </div>
      <motion.span
        className="font-mono text-[10px] tracking-wider"
        animate={{
          color: blocked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.35)",
        }}
        transition={{ duration: 0.18, ease: easeOut }}
      >
        {blocked ? "BLOCKED" : "ALLOWED"}
      </motion.span>
    </div>
  )
}

function MaxPrsPerDay() {
  const [limit, setLimit] = useState(3)
  const prs = [
    { user: "alice", count: 2, time: "10:32 AM" },
    { user: "bob", count: 4, time: "11:15 AM" },
    { user: "charlie", count: 1, time: "2:45 PM" },
    { user: "diana", count: 3, time: "4:20 PM" },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-wide text-white/[0.18] uppercase">
          limit
        </span>
        <input
          type="range"
          min={1}
          max={5}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="h-px flex-1 cursor-pointer appearance-none rounded-sm bg-[#262525] outline-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-[#1b1b1b] [&::-webkit-slider-thumb]:bg-white/35"
        />
        <span className="min-w-4 text-right font-mono text-[15px] font-medium text-white/70 tabular-nums">
          {limit}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {prs.map((p) => {
          const ok = p.count <= limit
          return (
            <div key={p.user} className="flex items-center gap-2">
              <motion.span
                className="w-14 font-mono text-[11px]"
                animate={{
                  color: ok
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(255,255,255,0.13)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {p.user}
              </motion.span>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="h-3 w-1.5 rounded-sm"
                    animate={{
                      backgroundColor:
                        i < p.count
                          ? i < limit
                            ? "rgba(255,255,255,0.22)"
                            : "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.04)",
                    }}
                    transition={{ duration: 0.2, ease: easeOut }}
                  />
                ))}
              </div>
              <motion.span
                className="font-mono text-[9px] text-white/15"
                animate={{ opacity: ok ? 0.5 : 0.2 }}
              >
                {p.time}
              </motion.span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MaxFilesChanged() {
  const [limit, setLimit] = useState(20)
  const prs = [
    { title: "fix: typo in readme", files: 1 },
    { title: "feat: add new auth flow", files: 12 },
    { title: "refactor: entire codebase", files: 47 },
    { title: "chore: update deps", files: 3 },
    { title: "feat: new dashboard", files: 28 },
  ]
  const maxFiles = 50

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-wide text-white/[0.18] uppercase">
          max
        </span>
        <input
          type="range"
          min={5}
          max={50}
          step={5}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="h-px flex-1 cursor-pointer appearance-none rounded-sm bg-[#262525] outline-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-[#1b1b1b] [&::-webkit-slider-thumb]:bg-white/35"
        />
        <span className="min-w-6 text-right font-mono text-[15px] font-medium text-white/70 tabular-nums">
          {limit}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {prs.map((p) => {
          const ok = p.files <= limit
          return (
            <div key={p.title} className="flex items-center gap-2">
              <motion.span
                className={`flex-1 truncate font-mono text-[10px] ${ok ? "" : "line-through"}`}
                animate={{
                  color: ok
                    ? "rgba(255,255,255,0.35)"
                    : "rgba(255,255,255,0.12)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {p.title}
              </motion.span>
              <div className="relative h-0.5 w-16 overflow-visible rounded-sm bg-[#262525]">
                <motion.div
                  className="h-full rounded-sm"
                  style={{ width: `${(p.files / maxFiles) * 100}%` }}
                  animate={{
                    backgroundColor: ok
                      ? "rgba(255,255,255,0.22)"
                      : "rgba(255,255,255,0.06)",
                  }}
                  transition={{ duration: 0.2, ease: easeOut }}
                />
                <motion.div
                  className="absolute -top-1 h-2.5 w-px bg-white/[0.12]"
                  animate={{ left: `${(limit / maxFiles) * 100}%` }}
                  transition={{ duration: 0.2, ease: easeOut }}
                />
              </div>
              <motion.span
                className="w-5 text-right font-mono text-[9px] tabular-nums"
                animate={{
                  color: ok ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {p.files}
              </motion.span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RepoActivityMinimum() {
  const [min, setMin] = useState(3)
  const users = [
    { name: "alice", repos: 12, stars: 45 },
    { name: "newbie", repos: 0, stars: 0 },
    { name: "charlie", repos: 5, stars: 8 },
    { name: "bot123", repos: 1, stars: 0 },
    { name: "diana", repos: 8, stars: 23 },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-wide text-white/[0.18] uppercase">
          min repos
        </span>
        <input
          type="range"
          min={1}
          max={10}
          value={min}
          onChange={(e) => setMin(Number(e.target.value))}
          className="h-px flex-1 cursor-pointer appearance-none rounded-sm bg-[#262525] outline-none [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-[#1b1b1b] [&::-webkit-slider-thumb]:bg-white/35"
        />
        <span className="min-w-4 text-right font-mono text-[15px] font-medium text-white/70 tabular-nums">
          {min}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {users.map((u) => {
          const ok = u.repos >= min
          return (
            <div key={u.name} className="flex items-center gap-2">
              <motion.span
                className="w-12 font-mono text-[11px]"
                animate={{
                  color: ok
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(255,255,255,0.13)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {u.name}
              </motion.span>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: Math.min(u.repos, 10) }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 w-1.5 rounded-sm"
                    animate={{
                      backgroundColor: ok
                        ? "rgba(255,255,255,0.25)"
                        : "rgba(255,255,255,0.08)",
                    }}
                    transition={{ duration: 0.2, ease: easeOut }}
                  />
                ))}
                {u.repos === 0 && (
                  <span className="font-mono text-[9px] text-white/10">
                    none
                  </span>
                )}
              </div>
              <motion.span
                className="w-4 text-right font-mono text-[10px] tabular-nums"
                animate={{
                  color: ok ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {u.repos}
              </motion.span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RequireProfileReadme() {
  const users = [
    { name: "alice", hasReadme: true, bio: "Building cool stuff" },
    { name: "bob", hasReadme: false, bio: "" },
    { name: "charlie", hasReadme: true, bio: "Open source maintainer" },
    { name: "newuser", hasReadme: false, bio: "" },
  ]
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      {users.map((u) => (
        <motion.div
          key={u.name}
          onMouseEnter={() => setHovered(u.name)}
          onMouseLeave={() => setHovered(null)}
          className="flex cursor-default items-center gap-2 rounded px-2 py-1.5"
          animate={{
            backgroundColor:
              hovered === u.name ? "rgba(255,255,255,0.02)" : "transparent",
          }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="flex h-5 w-5 items-center justify-center rounded font-mono text-[9px] font-bold"
            animate={{
              backgroundColor: u.hasReadme
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.03)",
              color: u.hasReadme
                ? "rgba(255,255,255,0.5)"
                : "rgba(255,255,255,0.15)",
            }}
            transition={{ duration: 0.2, ease: easeOut }}
          >
            {u.hasReadme ? "MD" : "?"}
          </motion.div>
          <div className="flex min-w-0 flex-1 flex-col">
            <motion.span
              className="font-mono text-[11px]"
              animate={{
                color: u.hasReadme
                  ? "rgba(255,255,255,0.45)"
                  : "rgba(255,255,255,0.15)",
              }}
              transition={{ duration: 0.2, ease: easeOut }}
            >
              {u.name}
            </motion.span>
            {u.hasReadme && u.bio && (
              <span className="truncate font-mono text-[9px] text-white/15">
                {u.bio}
              </span>
            )}
          </div>
          <motion.span
            className="font-mono text-[9px]"
            animate={{
              color: u.hasReadme
                ? "rgba(255,255,255,0.25)"
                : "rgba(255,255,255,0.1)",
            }}
            transition={{ duration: 0.2, ease: easeOut }}
          >
            {u.hasReadme ? "✓" : "✕"}
          </motion.span>
        </motion.div>
      ))}
    </div>
  )
}

type AllowBlockUser = { name: string; side: string }

function AllowBlockColumn({
  label,
  side,
  users,
  onToggle,
}: {
  label: string
  side: string
  users: AllowBlockUser[]
  onToggle: (name: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="mb-0.5 font-mono text-[9px] tracking-wider text-white/15 uppercase">
        {label}
      </span>
      <AnimatePresence mode="popLayout">
        {users
          .filter((u) => u.side === side)
          .map((u) => (
            <motion.button
              key={u.name}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={() => onToggle(u.name)}
              className="flex cursor-pointer items-center gap-1.5 rounded border border-[#2a2a2a] bg-transparent px-2 py-1 text-left font-mono text-[11px] text-white/35 transition-[border-color] duration-150 outline-none hover:border-[#3a3a3a] active:scale-[0.97]"
            >
              <span
                className={`size-1 rounded-sm ${side === "allow" ? "bg-white/25" : "bg-white/10"}`}
              />
              {u.name}
            </motion.button>
          ))}
      </AnimatePresence>
    </div>
  )
}

function AllowBlock() {
  const [users, setUsers] = useState<AllowBlockUser[]>([
    { name: "t3dotgg", side: "allow" },
    { name: "ripgrim", side: "allow" },
    { name: "cody-labs-ai", side: "block" },
    { name: "huangwei0903", side: "block" },
  ])

  const toggle = (name: string) =>
    setUsers((p) =>
      p.map((u) =>
        u.name === name
          ? { ...u, side: u.side === "allow" ? "block" : "allow" }
          : u
      )
    )

  return (
    <div className="flex gap-4">
      <AllowBlockColumn
        label="allowed"
        side="allow"
        users={users}
        onToggle={toggle}
      />
      <div className="w-px self-stretch bg-[#262525]" />
      <AllowBlockColumn
        label="blocked"
        side="block"
        users={users}
        onToggle={toggle}
      />
    </div>
  )
}

const FEATURES = [
  {
    title: "AI slop detection",
    description:
      "Pattern-match automated contributions and flag them before merge",
    content: <SlopDetection />,
  },
  {
    title: "Require profile picture",
    description: "Block contributors using GitHub's default silhouette",
    content: <ProfilePicture />,
  },
  {
    title: "Language gate",
    description: "Only accept contributions in your chosen language",
    content: <LanguageGate />,
  },
  {
    title: "PR threshold",
    description: "Minimum merged PRs before someone can contribute",
    content: <PRThreshold />,
  },
  {
    title: "Account age",
    description: "Block accounts created too recently from contributing",
    content: <AccountAge />,
  },
  {
    title: "Max PRs per day",
    description: "Rate limit PRs per user to prevent spam floods",
    content: <MaxPrsPerDay />,
  },
  {
    title: "Max files changed",
    description: "Reject PRs that modify too many files at once",
    content: <MaxFilesChanged />,
  },
  {
    title: "Repo activity",
    description: "Require contributors to have public repository history",
    content: <RepoActivityMinimum />,
  },
  {
    title: "Profile README",
    description: "Contributors must have a GitHub profile README",
    content: <RequireProfileReadme />,
  },
  {
    title: "Allow & block lists",
    description: "Per-user overrides for all your rules",
    content: <AllowBlock />,
  },
]

function CarouselCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col gap-4 rounded-xl border border-white/[0.04] bg-[#1f1f1f] px-5 py-5">
      <div>
        <h3 className="m-0 font-sans text-sm leading-tight font-medium tracking-tight text-white/75">
          {title}
        </h3>
        <p className="mt-1 mb-0 font-sans text-xs leading-relaxed font-normal text-white/[0.18]">
          {description}
        </p>
      </div>
      <div>{children}</div>
    </div>
  )
}

export function TripwireFeatures() {
  const [paused, setPaused] = useState(false)

  // Double the items for seamless loop
  const track = [...FEATURES, ...FEATURES]

  return (
    <div className="flex w-full flex-col items-center py-18 font-sans">
      {/* header */}
      <div className="mb-16 max-w-md px-8 text-center">
        <h2 className="m-0 font-sans text-[22px] leading-tight font-medium tracking-tight text-white/80">
          rules
        </h2>
        <p className="mt-2 mb-0 font-sans text-[13px] leading-relaxed text-white/[0.18]">
          guardrails that run on every contribution, automatically
        </p>
      </div>

      {/* carousel container */}
      <div
        className="relative w-full overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Edge blur — left */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-24 md:w-40"
          style={{
            background:
              "linear-gradient(to right, #191919 0%, transparent 100%)",
          }}
        />
        {/* Edge blur — right */}
        <div
          className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-24 md:w-40"
          style={{
            background:
              "linear-gradient(to left, #191919 0%, transparent 100%)",
          }}
        />

        {/* Scrolling track */}
        <div
          className="flex w-max gap-4"
          style={{
            animation: `carousel-scroll 60s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {track.map((f, i) => (
            <CarouselCard
              key={`${f.title}-${i}`}
              title={f.title}
              description={f.description}
            >
              {f.content}
            </CarouselCard>
          ))}
        </div>
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes carousel-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
