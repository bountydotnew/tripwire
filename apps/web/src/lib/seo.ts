import { siteConfig } from "./site-config"

/**
 * SEO + page-head helpers. Ported from diffkit's `lib/seo.ts` shape so
 * every route can build its head() with one call and consistent
 * branding/robots/canonical/og/twitter metadata.
 *
 * Convention: route file imports `buildSeo` and passes the result
 * straight into TanStack's `head()`:
 *
 *   head: ({ match }) => buildSeo({
 *     path: match.pathname,
 *     title: formatPageTitle("Events"),
 *     description: "...",
 *   })
 */

const MAX_DESCRIPTION_LENGTH = 160
const SEO_ROBOTS_INDEX =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
const SEO_ROBOTS_NOINDEX = "noindex, nofollow, noarchive"

/** Drop into a route's `headers` to keep the server response out of search indices. */
export const PRIVATE_ROUTE_HEADERS = {
  "X-Robots-Tag": SEO_ROBOTS_NOINDEX,
} as const

export type SeoInput = {
  siteUrl?: string
  path: string
  title: string
  description: string
  imagePath?: string
  imageAlt?: string
  robots?: "index" | "noindex"
  type?: "website" | "article" | "profile"
  includeCanonical?: boolean
}

type WebSiteSchemaInput = {
  siteUrl?: string
  path?: string
}

/**
 * Build the full set of `<head>` tags for a page — title, description,
 * robots, OpenGraph, Twitter cards, and an optional canonical link.
 * Returns the `{ meta, links }` shape TanStack Router's `head()` accepts.
 */
export function buildSeo({
  description,
  imageAlt = `${siteConfig.name} preview`,
  imagePath = siteConfig.socialImagePath,
  includeCanonical = true,
  path,
  robots = "index",
  siteUrl = siteConfig.url,
  title,
  type = "website",
}: SeoInput) {
  const canonicalUrl = toAbsoluteUrl(siteUrl, path)
  const imageUrl = toAbsoluteUrl(siteUrl, imagePath)
  const normalizedDescription = summarizeText(description)
  const robotsContent =
    robots === "noindex" ? SEO_ROBOTS_NOINDEX : SEO_ROBOTS_INDEX

  return {
    links: includeCanonical
      ? [{ rel: "canonical", href: canonicalUrl }]
      : undefined,
    meta: [
      { title },
      { name: "description", content: normalizedDescription },
      { name: "robots", content: robotsContent },
      { name: "googlebot", content: robotsContent },
      { property: "og:site_name", content: siteConfig.name },
      { property: "og:type", content: type },
      { property: "og:title", content: title },
      { property: "og:description", content: normalizedDescription },
      { property: "og:url", content: canonicalUrl },
      { property: "og:image", content: imageUrl },
      { property: "og:image:alt", content: imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: normalizedDescription },
      { name: "twitter:image", content: imageUrl },
    ],
  }
}

/**
 * JSON-LD structured data describing the site as a whole. Drop into a
 * `<script type="application/ld+json">` in the root document so search
 * engines learn the canonical site + publisher relationship once.
 */
export function buildWebSiteSchema({
  path = "/",
  siteUrl = siteConfig.url,
}: WebSiteSchemaInput) {
  const siteRoot = toAbsoluteUrl(siteUrl, "/")

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: siteConfig.name,
        url: siteRoot,
        description: siteConfig.defaultDescription,
        publisher: {
          "@type": "Organization",
          name: siteConfig.name,
          url: siteRoot,
          logo: {
            "@type": "ImageObject",
            url: toAbsoluteUrl(siteUrl, siteConfig.socialImagePath),
          },
          sameAs: [siteConfig.githubRepositoryUrl],
        },
      },
      {
        "@type": "WebPage",
        name: siteConfig.defaultTitle,
        url: toAbsoluteUrl(siteUrl, path),
        isPartOf: { "@id": siteRoot },
      },
    ],
  }
}

/**
 * JSON-LD that classifies tripwire as a SoftwareApplication. Lets
 * search engines render rich product cards.
 */
export function buildSoftwareApplicationSchema(siteUrl: string = siteConfig.url) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    description: siteConfig.defaultDescription,
    url: toAbsoluteUrl(siteUrl, "/login"),
    image: toAbsoluteUrl(siteUrl, siteConfig.socialImagePath),
    codeRepository: siteConfig.githubRepositoryUrl,
  }
}

/**
 * Normalize free-form text into a clean description suitable for
 * `<meta name="description">` and OpenGraph. Strips markdown, HTML,
 * collapses whitespace, and clamps to ~160 chars at a word boundary.
 */
export function summarizeText(
  input: string | null | undefined,
  fallback = siteConfig.defaultDescription,
): string {
  if (!input) return fallback

  const normalized = input
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return fallback
  if (normalized.length <= MAX_DESCRIPTION_LENGTH) return normalized

  return `${normalized.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}...`
}

/**
 * Suffix a page title with the product name. No-op when the title
 * already contains the product name (e.g. the landing page title).
 */
export function formatPageTitle(value: string): string {
  return value.includes(siteConfig.name)
    ? value
    : `${value} | ${siteConfig.name}`
}

/**
 * Resolve a possibly-relative path against a site URL into a fully
 * qualified URL. Uses the URL constructor so query strings, fragments,
 * and absolute inputs all behave correctly.
 */
export function toAbsoluteUrl(siteUrl: string, path: string): string {
  return new URL(path, ensureTrailingSlash(siteUrl)).toString()
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`
}

// ---------------------------------------------------------------------------
// Back-compat shims for the previous `buildSeoMeta` / `canonicalLink` /
// `clipDescription` API. New code should use `buildSeo` directly.
// ---------------------------------------------------------------------------

export type SeoMeta =
  | { name?: string; property?: string; content: string }
  | { title: string }

interface LegacySeoInput {
  title: string
  rawTitle?: boolean
  description: string
  path: string
  image?: string
  type?: "website" | "article" | "profile"
}

/**
 * @deprecated Prefer `buildSeo` which returns `{ meta, links }` as a
 * single call. Kept to avoid touching every existing consumer at once.
 */
export function buildSeoMeta(input: LegacySeoInput): SeoMeta[] {
  const built = buildSeo({
    title: input.rawTitle ? input.title : formatPageTitle(input.title),
    description: input.description,
    path: input.path,
    imagePath: input.image,
    type: input.type ?? "website",
    includeCanonical: false,
  })
  return built.meta as SeoMeta[]
}

/** @deprecated Use `buildSeo({ includeCanonical: true })` instead. */
export function canonicalLink(path: string) {
  return { rel: "canonical", href: toAbsoluteUrl(siteConfig.url, path) }
}

/** @deprecated Use `summarizeText` (handles markdown + HTML stripping too). */
export function clipDescription(text: string, max = 200): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed.length <= max) return collapsed
  const cut = collapsed.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
