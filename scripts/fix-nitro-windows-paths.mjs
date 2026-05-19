import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

if (process.platform !== "win32") {
  console.log("[fix-nitro-paths] Not on Windows, skipping.")
  process.exit(0)
}

const pnpmDir = join(process.cwd(), "node_modules", ".pnpm")
let nitroDir
try {
  const dirs = readdirSync(pnpmDir)
  const nitroEntry = dirs.find((d) => d.startsWith("nitro@"))
  if (!nitroEntry) {
    console.log("No nitro found")
    process.exit(0)
  }
  nitroDir = join(pnpmDir, nitroEntry, "node_modules", "nitro")
} catch {
  process.exit(0)
}

const filePath = join(nitroDir, "dist", "_build", "common.mjs")
let c = readFileSync(filePath, "utf8")

// Sentinel
if (c.includes("_fixWinPath(")) {
  console.log("[fix-nitro-paths] Already patched.")
  process.exit(0)
}

// Inject a helper function right at the start of the file
const helper = `function _fixWinPath(p){return typeof p==="string"?p.split("\\\\").join("/"):p;}\n`
c = helper + c

// Replace template literal path interpolations:
// from "${h}" → from "${_fixWinPath(h)}"
c = c.split('from "${h}";').join('from "${_fixWinPath(h)}";')
// from "${builtinHandler}" → from "${_fixWinPath(builtinHandler)}"
c = c
  .split('from "${builtinHandler}";')
  .join('from "${_fixWinPath(builtinHandler)}";')
// from "${plugin}"; → from "${_fixWinPath(plugin)}";
c = c.split('from "${plugin}";').join('from "${_fixWinPath(plugin)}";')

writeFileSync(filePath, c)
console.log(
  "[fix-nitro-paths] Patched Nitro virtual templates for Windows paths."
)
