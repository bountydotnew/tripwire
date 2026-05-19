const APP_NAME = "Tripwire"
const WEB_URL =
  typeof window !== "undefined" ? window.location.origin : "https://tripwire.sh"

export type SeoMeta =
  | { name?: string; property?: string; content: string }
  | { title: string }

export interface SeoInput {
  title: string
  rawTitle?: boolean
  description: string
  path: string
  image?: string
  type?: "website" | "article" | "profile"
}

const abs = (urlOrPath: string) =>
  urlOrPath.startsWith("http") ? urlOrPath : `${WEB_URL}${urlOrPath}`

export function buildSeoMeta(input: SeoInput): SeoMeta[] {
  const title = input.rawTitle ? input.title : `${input.title} — ${APP_NAME}`
  const url = abs(input.path)
  const image = abs(input.image ?? "/og")
  const type = input.type ?? "website"

  return [
    { title },
    { name: "description", content: input.description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: image },
  ]
}

export function canonicalLink(path: string) {
  return { rel: "canonical", href: abs(path) }
}

export function clipDescription(text: string, max = 200): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed.length <= max) return collapsed
  const cut = collapsed.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
