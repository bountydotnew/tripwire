import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const easeOut = [0.23, 1, 0.32, 1] as const;

// ─── Slop Detection ─────────────────────────────────────────
function SlopDetection() {
  const lines = [
    { text: "fix: resolve race condition in pool", bad: false },
    { text: "refactor: extract auth middleware", bad: false },
    { text: "As an AI language model, I can", bad: true },
    { text: "feat: add rate limiting to /api", bad: false },
    { text: "Certainly! Here is a comprehen", bad: true },
    { text: "fix: edge case in parser.ts", bad: false },
  ];
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    let i = -1;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i++;
      if (i >= lines.length) {
        timer = setTimeout(() => {
          i = -1;
          setCursor(-1);
          timer = setTimeout(step, 600);
        }, 2000);
        return;
      }
      setCursor(i);
      timer = setTimeout(step, 500);
    };
    timer = setTimeout(step, 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((l, i) => {
        const scanned = i <= cursor;
        const hit = scanned && l.bad;
        const scanning = i === cursor;
        return (
          <motion.div
            key={i}
            className="flex items-center gap-2.5 py-1.5 px-2"
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
              className={`font-mono text-xs leading-5 whitespace-nowrap overflow-hidden text-ellipsis ${hit ? "line-through" : ""}`}
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
        );
      })}
    </div>
  );
}

// ─── Profile Picture ────────────────────────────────────────
function ProfilePicture() {
  const items = [
    { real: true, img: "https://avatars.githubusercontent.com/u/75869731?v=4" },
    { real: false, img: "https://avatars.githubusercontent.com/u/200853?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/13007539?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/140507264?v=4" },
    { real: false, img: "https://avatars.githubusercontent.com/u/423536?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/14241866?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/68947960?v=4" },
    { real: false, img: "https://avatars.githubusercontent.com/u/1002943?v=4" },
    { real: true, img: "https://avatars.githubusercontent.com/u/6751787?v=4" },
  ];
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it, i) => {
        const isHov = hovered === i;
        return (
          <motion.div
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="w-10 h-10 rounded overflow-hidden cursor-default relative"
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
              className={`w-full h-full object-cover block ${!it.real ? "grayscale" : ""}`}
            />
            <AnimatePresence>
              {isHov && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: easeOut }}
                  className={`absolute -top-1 -right-1 w-3 h-3 rounded-sm flex items-center justify-center ${it.real ? "bg-[#333]" : "bg-[#2a2a2a]"}`}
                  style={{ border: "1.5px solid #1b1b1b" }}
                >
                  <span
                    className={`text-[7px] font-semibold leading-none ${it.real ? "text-white/70" : "text-white/30"}`}
                  >
                    {it.real ? "✓" : "✕"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {!it.real && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)",
                }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Language Gate ───────────────────────────────────────────
function LanguageGate() {
  const [lang, setLang] = useState("en");
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
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-0.5">
        {["en", "es"].map((l) => (
          <motion.button
            key={l}
            onClick={() => setLang(l)}
            className="py-1 px-3 rounded cursor-pointer font-mono text-[11px] font-medium tracking-wide uppercase outline-none"
            animate={{
              borderColor: lang === l ? "#3a3a3a" : "#2a2a2a",
              backgroundColor: lang === l ? "#262525" : "rgba(0,0,0,0)",
              color: lang === l ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
            }}
            whileActive={{ scale: 0.97 }}
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
              className="flex items-center gap-2 py-1 px-2"
              style={{
                borderLeftWidth: 1.5,
                borderLeftStyle: "solid",
                borderLeftColor: s.ok ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
              }}
            >
              <span
                className={`font-mono text-[11.5px] whitespace-nowrap overflow-hidden text-ellipsis ${s.ok ? "text-white/40" : "text-white/15 line-through"}`}
              >
                {s.t}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── PR Threshold ───────────────────────────────────────────
function PRThreshold() {
  const [min, setMin] = useState(5);
  const users = [
    { n: "alice", v: 12 },
    { n: "bob", v: 3 },
    { n: "charlie", v: 8 },
    { n: "newbie", v: 1 },
    { n: "diana", v: 5 },
    { n: "eve", v: 0 },
  ];
  const maxV = 12;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-white/[0.18] tracking-wide uppercase">
          min
        </span>
        <input
          type="range"
          min={0}
          max={10}
          value={min}
          onChange={(e) => setMin(Number(e.target.value))}
          className="flex-1 h-px cursor-pointer appearance-none bg-[#262525] rounded-sm outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-white/35 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-[#1b1b1b]"
        />
        <span className="font-mono text-[15px] font-medium text-white/70 min-w-4 text-right tabular-nums">
          {min}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {users.map((u) => {
          const ok = u.v >= min;
          return (
            <div key={u.n} className="flex items-center gap-2">
              <motion.span
                className="font-mono text-[11px] w-13"
                animate={{ color: ok ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.13)" }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {u.n}
              </motion.span>
              <div className="flex-1 h-0.5 bg-[#262525] rounded-sm relative overflow-visible">
                <motion.div
                  className="h-full rounded-sm"
                  style={{ width: `${(u.v / maxV) * 100}%` }}
                  animate={{
                    backgroundColor: ok ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)",
                  }}
                  transition={{ duration: 0.2, ease: easeOut }}
                />
                <motion.div
                  className="absolute -top-1 w-px h-2.5 bg-white/[0.12]"
                  animate={{ left: `${(min / maxV) * 100}%` }}
                  transition={{ duration: 0.2, ease: easeOut }}
                />
              </div>
              <motion.span
                className="font-mono text-[10px] w-3.5 text-right"
                animate={{ color: ok ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)" }}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {u.v}
              </motion.span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Account Age ────────────────────────────────────────────
function AccountAge() {
  const [day, setDay] = useState(0);
  const limit = 30;

  useEffect(() => {
    const interval = setInterval(() => setDay((p) => (p >= 36 ? 0 : p + 1)), 100);
    return () => clearInterval(interval);
  }, []);

  const capped = Math.min(day, limit);
  const blocked = day < limit;
  const pct = (capped / limit) * 100;

  return (
    <div className="flex flex-col gap-3.5 w-full">
      <div className="flex items-baseline gap-1.5">
        <motion.span
          className="font-mono text-[28px] font-medium leading-none tabular-nums"
          animate={{ color: blocked ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.65)" }}
          transition={{ duration: 0.18, ease: easeOut }}
        >
          {capped}
        </motion.span>
        <span className="font-mono text-[11px] text-white/[0.12]">/ {limit}d</span>
      </div>
      <div className="w-full h-0.5 bg-[#262525] rounded-sm overflow-hidden">
        <motion.div
          className="h-full rounded-sm"
          animate={{
            width: `${pct}%`,
            backgroundColor: blocked ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.25)",
          }}
          transition={{ width: { duration: 0.1, ease: "linear" }, backgroundColor: { duration: 0.18, ease: easeOut } }}
        />
      </div>
      <motion.span
        className="font-mono text-[10px] tracking-wider"
        animate={{ color: blocked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.35)" }}
        transition={{ duration: 0.18, ease: easeOut }}
      >
        {blocked ? "BLOCKED" : "ALLOWED"}
      </motion.span>
    </div>
  );
}

// ─── Allow & Block ──────────────────────────────────────────
function AllowBlock() {
  const [users, setUsers] = useState([
    { name: "t3dotgg", side: "allow" },
    { name: "ripgrim", side: "allow" },
    { name: "cody-labs-ai", side: "block" },
    { name: "huangwei0903", side: "block" },
  ]);

  const toggle = (name: string) =>
    setUsers((p) =>
      p.map((u) =>
        u.name === name ? { ...u, side: u.side === "allow" ? "block" : "allow" } : u
      )
    );

  const Col = ({ label, side }: { label: string; side: string }) => (
    <div className="flex-1 flex flex-col gap-1">
      <span className="font-mono text-[9px] tracking-wider uppercase text-white/15 mb-0.5">
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
              onClick={() => toggle(u.name)}
              className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer bg-transparent font-mono text-[11px] text-white/35 text-left outline-none border border-[#2a2a2a] hover:border-[#3a3a3a] active:scale-[0.97] transition-[border-color] duration-150"
            >
              <span
                className={`w-1 h-1 rounded-sm ${side === "allow" ? "bg-white/25" : "bg-white/10"}`}
              />
              {u.name}
            </motion.button>
          ))}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex gap-4">
      <Col label="allowed" side="allow" />
      <div className="w-px bg-[#262525] self-stretch" />
      <Col label="blocked" side="block" />
    </div>
  );
}

// ─── Feature Block ──────────────────────────────────────────
function Feature({
  title,
  description,
  children,
  index,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: easeOut, delay: index * 0.06 }}
      className="flex flex-col gap-4"
    >
      <div>
        <h3 className="m-0 font-sans text-sm font-medium text-white/75 tracking-tight leading-tight">
          {title}
        </h3>
        <p className="mt-1 mb-0 font-sans text-xs text-white/[0.18] leading-relaxed font-normal">
          {description}
        </p>
      </div>
      <div>{children}</div>
    </motion.div>
  );
}

// ─── Main ───────────────────────────────────────────────────
export function TripwireFeatures() {
  return (
    <div className="flex flex-col items-center py-18 px-8 font-sans w-full">
      {/* header */}
      <div className="text-center mb-16 max-w-md">
        <h2 className="m-0 font-sans text-[22px] font-medium text-white/80 tracking-tight leading-tight">
          rules
        </h2>
        <p className="mt-2 mb-0 font-sans text-[13px] text-white/[0.18] leading-relaxed">
          guardrails that run on every contribution, automatically
        </p>
      </div>

      {/* grid — no cards, just content */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-14 gap-y-12 max-w-[640px] w-full">
        <Feature
          index={0}
          title="AI slop detection"
          description="Pattern-match automated contributions and flag them before merge"
        >
          <SlopDetection />
        </Feature>

        <Feature
          index={1}
          title="Require profile picture"
          description="Block contributors using GitHub's default silhouette"
        >
          <ProfilePicture />
        </Feature>

        <Feature
          index={2}
          title="Language gate"
          description="Only accept contributions in your chosen language"
        >
          <LanguageGate />
        </Feature>

        <Feature
          index={3}
          title="PR threshold"
          description="Minimum merged PRs before someone can contribute"
        >
          <PRThreshold />
        </Feature>

        <Feature
          index={4}
          title="Account age"
          description="Block accounts created too recently from contributing"
        >
          <AccountAge />
        </Feature>

        <Feature
          index={5}
          title="Allow & block lists"
          description="Per-user overrides for all your rules"
        >
          <AllowBlock />
        </Feature>
      </div>
    </div>
  );
}
