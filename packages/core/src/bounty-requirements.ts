/** Requirement criterion extracted from a bounty issue body. */
export interface BountyRequirementCriterion {
  id: string
  sourceHeading: string
  text: string
}

/** Matched submission terms for a single bounty requirement. */
export interface BountyRequirementMatch {
  criterion: BountyRequirementCriterion
  matchedTerms: string[]
}

/** Aggregate validation result for a PR submission against bounty criteria. */
export interface BountyRequirementValidation {
  status: "no_criteria" | "valid" | "missing_requirements"
  coverage: number
  requiredCount: number
  matched: BountyRequirementMatch[]
  missing: BountyRequirementCriterion[]
}

const REQUIREMENT_HEADINGS = new Set([
  "acceptance criteria",
  "criteria",
  "deliverables",
  "expected behavior",
  "expected outcome",
  "fix",
  "must haves",
  "requirements",
  "technical constraints",
  "constraints",
])

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "must",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "this",
  "to",
  "with",
])

function normalizeHeading(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/[:#*_`~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function normalizeCriterion(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "")
    .replace(/^\s*\[[ xX]\]\s*/, "")
    .replace(/^[-*+]\s+\[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function criterionTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/`[^`]+`/g, " ")
        .replace(/[^a-z0-9_]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    )
  )
}

function isListItem(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?\S/.test(line)
}

function isHeading(line: string): boolean {
  return (
    /^#{1,6}\s+\S/.test(line) ||
    /^[A-Za-z][A-Za-z0-9 /_-]{1,80}:$/.test(line) ||
    /^\*\*[A-Za-z][A-Za-z0-9 /_-]{1,80}:?\*\*$/.test(line)
  )
}

function looksLikeRequirementHeading(line: string): boolean {
  return REQUIREMENT_HEADINGS.has(normalizeHeading(line))
}

function makeCriterion(
  sourceHeading: string,
  text: string,
  ordinal: number
): BountyRequirementCriterion | null {
  const normalized = normalizeCriterion(text)
  if (!normalized || criterionTerms(normalized).length === 0) return null
  return {
    id: `${sourceHeading}-${ordinal}`,
    sourceHeading,
    text: normalized,
  }
}

/** Extracts checklist-style criteria from requirement-like sections. */
export function extractBountyRequirementCriteria(
  body: string
): BountyRequirementCriterion[] {
  const criteria: BountyRequirementCriterion[] = []
  const lines = body.split(/\r?\n/)
  let activeHeading: string | null = null
  let activeOrdinal = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (isHeading(line)) {
      activeHeading = looksLikeRequirementHeading(line)
        ? normalizeHeading(line)
        : null
      activeOrdinal = 0
      continue
    }

    if (!activeHeading) continue

    if (isListItem(rawLine)) {
      activeOrdinal += 1
      const criterion = makeCriterion(activeHeading, rawLine, activeOrdinal)
      if (criterion) criteria.push(criterion)
      continue
    }

    const paragraphCriterion = makeCriterion(
      activeHeading,
      rawLine,
      activeOrdinal + 1
    )
    if (paragraphCriterion) {
      activeOrdinal += 1
      criteria.push(paragraphCriterion)
    }
  }

  return criteria
}

function criterionMatchesSubmission(
  criterion: BountyRequirementCriterion,
  submissionTerms: Set<string>
): BountyRequirementMatch | null {
  const terms = criterionTerms(criterion.text)
  if (terms.length === 0) return null

  const matchedTerms = terms.filter((term) => submissionTerms.has(term))
  const requiredMatches = terms.length <= 3 ? 1 : Math.ceil(terms.length * 0.45)

  if (matchedTerms.length < requiredMatches) return null

  return { criterion, matchedTerms }
}

/** Validates whether a submission references all extracted bounty criteria. */
export function validateBountySubmissionRequirements(opts: {
  bountyBody: string
  submissionText: string
}): BountyRequirementValidation {
  const criteria = extractBountyRequirementCriteria(opts.bountyBody)
  if (criteria.length === 0) {
    return {
      status: "no_criteria",
      coverage: 1,
      requiredCount: 0,
      matched: [],
      missing: [],
    }
  }

  const submissionTerms = new Set(criterionTerms(opts.submissionText))
  const matched: BountyRequirementMatch[] = []
  const missing: BountyRequirementCriterion[] = []

  for (const criterion of criteria) {
    const match = criterionMatchesSubmission(criterion, submissionTerms)
    if (match) matched.push(match)
    else missing.push(criterion)
  }

  const coverage = matched.length / criteria.length

  return {
    status: missing.length === 0 ? "valid" : "missing_requirements",
    coverage,
    requiredCount: criteria.length,
    matched,
    missing,
  }
}

/** Formats missing criteria for a concise decline comment. */
export function formatBountyRequirementValidation(
  validation: BountyRequirementValidation
): string | null {
  if (validation.status !== "missing_requirements") return null

  const missingItems = validation.missing
    .slice(0, 3)
    .map((criterion) => `- ${criterion.text}`)
    .join("\n")
  const extra =
    validation.missing.length > 3
      ? `\n- ...and ${validation.missing.length - 3} more`
      : ""

  return [
    "Requirement validation found missing criteria before processing:",
    missingItems + extra,
  ].join("\n")
}
