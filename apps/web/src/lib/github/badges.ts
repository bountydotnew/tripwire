const ASSETS_BASE =
  "https://github.githubassets.com/images/modules/profile/achievements"

export type BadgeTier = "default" | "bronze" | "silver" | "gold"

export interface BadgeDefinition {
  slug: string
  label: string
  description: string
  maxTier: number
  hasSkinTones: boolean
}

export const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  starstruck: {
    slug: "starstruck",
    label: "Starstruck",
    description: "Created a repository that has many stars",
    maxTier: 4,
    hasSkinTones: true,
  },
  quickdraw: {
    slug: "quickdraw",
    label: "Quickdraw",
    description: "Closed an issue/PR within 5 minutes of opening",
    maxTier: 1,
    hasSkinTones: true,
  },
  "pair-extraordinaire": {
    slug: "pair-extraordinaire",
    label: "Pair Extraordinaire",
    description: "Co-authored commits on merged pull requests",
    maxTier: 4,
    hasSkinTones: false,
  },
  "pull-shark": {
    slug: "pull-shark",
    label: "Pull Shark",
    description: "Opened pull requests that have been merged",
    maxTier: 4,
    hasSkinTones: false,
  },
  "galaxy-brain": {
    slug: "galaxy-brain",
    label: "Galaxy Brain",
    description: "Answers marked as accepted in Discussions",
    maxTier: 4,
    hasSkinTones: false,
  },
  yolo: {
    slug: "yolo",
    label: "YOLO",
    description: "Merged a PR without code review",
    maxTier: 1,
    hasSkinTones: false,
  },
  "public-sponsor": {
    slug: "public-sponsor",
    label: "Public Sponsor",
    description: "Sponsored an open source contributor through GitHub Sponsors",
    maxTier: 1,
    hasSkinTones: false,
  },
  "mars-2020-contributor": {
    slug: "mars-2020-contributor",
    label: "Mars 2020",
    description:
      "Contributed code to a repository used in the Mars 2020 mission",
    maxTier: 1,
    hasSkinTones: false,
  },
  "arctic-code-vault-contributor": {
    slug: "arctic-code-vault-contributor",
    label: "Arctic Code Vault",
    description:
      "Contributed to repositories archived in the 2020 GitHub Archive Program",
    maxTier: 1,
    hasSkinTones: false,
  },
  "heart-on-your-sleeve": {
    slug: "heart-on-your-sleeve",
    label: "Heart On Your Sleeve",
    description: "Reacted with a heart emoji",
    maxTier: 4,
    hasSkinTones: false,
  },
  "open-sourcerer": {
    slug: "open-sourcerer",
    label: "Open Sourcerer",
    description:
      "Opened pull requests that have been merged in multiple public repositories",
    maxTier: 4,
    hasSkinTones: false,
  },
}

const TIER_MAP: Record<number, BadgeTier> = {
  1: "default",
  2: "bronze",
  3: "silver",
  4: "gold",
}

const TIER_LABEL: Record<BadgeTier, string> = {
  default: "",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
}

const TIER_COLOR: Record<BadgeTier, string> = {
  default: "#9F9FA9",
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
}

/** Get the badge image URL for a given achievement type and tier */
export function getBadgeImageUrl(type: string, tier: number): string {
  const tierName = TIER_MAP[tier] ?? "default"
  return `${ASSETS_BASE}/${type}-${tierName}.png`
}

/** Get display info for a badge */
export function getBadgeInfo(type: string, tier: number) {
  const def = BADGE_DEFINITIONS[type]
  const tierName = TIER_MAP[tier] ?? "default"
  return {
    label: def?.label ?? type,
    description: def?.description ?? "",
    tierLabel: TIER_LABEL[tierName],
    tierColor: TIER_COLOR[tierName],
    imageUrl: getBadgeImageUrl(type, tier),
  }
}
