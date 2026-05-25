/**
 * Single source of truth for tripwire's branding + canonical URLs.
 * Used by SEO helpers, manifests, and any place that needs to refer
 * to the product by name or surface a canonical link.
 */

type SiteConfig = {
  name: string
  domain: string
  url: string
  githubRepositoryUrl: string
  themeColor: string
  socialImagePath: string
  defaultTitle: string
  defaultDescription: string
  manifestName: string
  manifestCategories: string[]
}

export const siteConfig: SiteConfig = {
  name: "Tripwire",
  domain: "tripwire.sh",
  url: "https://tripwire.sh",
  githubRepositoryUrl: "https://github.com/tripwire-dev/tripwire",
  themeColor: "#000000",
  socialImagePath: "/og.jpg",
  defaultTitle:
    "Tripwire | Spam, abuse, and AI-slop protection for GitHub repos",
  defaultDescription:
    "Tripwire protects open-source maintainers from spam PRs, abusive accounts, and AI-generated noise with rules that run on every webhook.",
  manifestName: "Tripwire",
  manifestCategories: ["developer tools", "productivity"],
}
