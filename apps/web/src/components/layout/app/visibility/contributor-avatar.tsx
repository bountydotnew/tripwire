interface ContributorAvatarProps {
  username: string
  githubUserId: number | null
  avatarUrl?: string | null
  size?: "sm" | "md" | "lg"
}

const SIZE_CLASS = {
  sm: { box: "size-6", text: "text-[11px]", px: 40 },
  md: { box: "size-6", text: "text-[11px]", px: 48 },
  lg: { box: "size-10", text: "text-[15px]", px: 80 },
} as const

export function ContributorAvatar({
  username,
  githubUserId,
  avatarUrl,
  size = "md",
}: ContributorAvatarProps) {
  const { box, text, px } = SIZE_CLASS[size]
  const ghUrl = githubUserId
    ? `https://avatars.githubusercontent.com/u/${githubUserId}?v=4&s=${px}`
    : null
  const src = avatarUrl ?? ghUrl

  if (src) {
    return (
      <span
        className={`${box} shrink-0 overflow-hidden rounded-full bg-tw-inner bg-cover bg-center`}
        style={{ backgroundImage: `url('${src}')` }}
      />
    )
  }
  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-tw-inner ${text} font-medium text-tw-text-secondary`}
    >
      {username.slice(0, 1).toUpperCase()}
    </span>
  )
}
