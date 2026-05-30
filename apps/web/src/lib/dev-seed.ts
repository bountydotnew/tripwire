import { and, eq, inArray } from "drizzle-orm"
import { auth } from "@tripwire/auth"
import { db } from "@tripwire/db/client"
import {
  DEFAULT_RULE_CONFIG,
  account,
  blacklistEntries,
  customRules,
  events,
  member,
  onboardingState,
  organization,
  organizations,
  repositories,
  ruleConfigs,
  user,
  userPreferences,
  whitelistEntries,
  workflows,
  type CustomRuleDefinition,
  type RuleConfig,
  type WorkflowDefinition,
} from "@tripwire/db"

const DEV_LOGIN_EMAIL = "dev@tripwire.local"
const DEV_LOGIN_PASSWORD = "tripwire-dev-password"

const DEV_BA_ORG_ID = "dev-workspace"
const DEV_MEMBER_ID = "dev-workspace-owner"
const DEV_INSTALLATION_ID = 93_001
const DEV_GITHUB_ACCOUNT_ID = 93_002
const DEV_REPO_GITHUB_ID = 93_003

const seededRuleConfig: RuleConfig = {
  ...DEFAULT_RULE_CONFIG,
  accountAge: { enabled: true, action: "warn", days: 21 },
  maxPrsPerDay: { enabled: true, action: "block", limit: 3 },
  aiHoneypot: { enabled: true, action: "block" },
  repoFiles: {
    ...DEFAULT_RULE_CONFIG.repoFiles,
    prTemplate: {
      autoSync: true,
      honeypotEnabled: true,
      honeypotPhrases: [{ kind: "natural", phrase: "mention the wax seal" }],
      customContent:
        "Please describe the intent of this change and any security-sensitive files touched.",
    },
  },
}

const seededWorkflowDefinition: WorkflowDefinition = {
  nodes: [
    {
      id: "trigger-pr-opened",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: { subtype: "pr_opened", label: "PR opened" },
    },
    {
      id: "rule-account-age",
      type: "rule",
      position: { x: 260, y: 0 },
      data: { subtype: "accountAge", days: 21 },
    },
    {
      id: "action-warn",
      type: "action",
      position: { x: 520, y: 0 },
      data: { subtype: "warn", message: "Ask for maintainer review" },
    },
  ],
  edges: [
    {
      id: "trigger-to-age",
      source: "trigger-pr-opened",
      target: "rule-account-age",
    },
    {
      id: "age-to-warn",
      source: "rule-account-age",
      target: "action-warn",
      sourceHandle: "fail",
    },
  ],
}

const seededCustomRuleDefinition: CustomRuleDefinition = {
  outputNodeId: "condition-suspicious-title",
  nodes: [
    {
      id: "condition-suspicious-title",
      type: "condition",
      position: { x: 0, y: 0 },
      data: {
        field: "title",
        operator: "contains",
        value: "urgent",
      },
    },
  ],
  edges: [],
}

export async function ensureDevLoginUser(headers = new Headers()) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Dev login user is only available in development.")
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_LOGIN_EMAIL))
    .limit(1)

  if (existing) {
    const [credentialAccount] = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, existing.id), eq(account.providerId, "credential"))
      )
      .limit(1)

    if (credentialAccount) return existing

    await db.delete(user).where(eq(user.id, existing.id))
  }

  await auth.api.signUpEmail({
    body: {
      name: "Dev User",
      email: DEV_LOGIN_EMAIL,
      password: DEV_LOGIN_PASSWORD,
    },
    headers,
  })

  const [created] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_LOGIN_EMAIL))
    .limit(1)

  if (!created) {
    throw new Error("Failed to create the dev login user.")
  }

  return created
}

export async function signInDevLoginUser(headers = new Headers()) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Dev login is only available in development.")
  }

  return auth.api.signInEmail({
    body: {
      email: DEV_LOGIN_EMAIL,
      password: DEV_LOGIN_PASSWORD,
      callbackURL: "/home",
    },
    headers,
    asResponse: true,
  })
}

export async function seedDevWorkspace() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Dev seed is only available in development.")
  }

  const [devUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_LOGIN_EMAIL))
    .limit(1)

  if (!devUser) {
    throw new Error("Create the dev user before seeding workspace data.")
  }

  const now = new Date()

  await db
    .insert(organization)
    .values({
      id: DEV_BA_ORG_ID,
      name: "Tripwire Dev",
      slug: "tripwire-dev",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: organization.id,
      set: {
        name: "Tripwire Dev",
        slug: "tripwire-dev",
      },
    })

  await db
    .insert(member)
    .values({
      id: DEV_MEMBER_ID,
      organizationId: DEV_BA_ORG_ID,
      userId: devUser.id,
      role: "owner",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: member.id,
      set: {
        organizationId: DEV_BA_ORG_ID,
        userId: devUser.id,
        role: "owner",
      },
    })

  const [tripwireOrg] = await db
    .insert(organizations)
    .values({
      githubInstallationId: DEV_INSTALLATION_ID,
      githubAccountId: DEV_GITHUB_ACCOUNT_ID,
      githubAccountLogin: "tripwire-dev",
      githubAccountType: "Organization",
      avatarUrl: null,
      ownerId: devUser.id,
      betterAuthOrgId: DEV_BA_ORG_ID,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: organizations.githubInstallationId,
      set: {
        githubAccountLogin: "tripwire-dev",
        ownerId: devUser.id,
        betterAuthOrgId: DEV_BA_ORG_ID,
        updatedAt: now,
      },
    })
    .returning({ id: organizations.id })

  if (!tripwireOrg) {
    throw new Error("Failed to seed Tripwire dev organization.")
  }

  const [repo] = await db
    .insert(repositories)
    .values({
      orgId: tripwireOrg.id,
      githubRepoId: DEV_REPO_GITHUB_ID,
      name: "example-repo",
      fullName: "tripwire-dev/example-repo",
      isPrivate: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: repositories.githubRepoId,
      set: {
        orgId: tripwireOrg.id,
        name: "example-repo",
        fullName: "tripwire-dev/example-repo",
        isPrivate: false,
        updatedAt: now,
      },
    })
    .returning({ id: repositories.id })

  if (!repo) {
    throw new Error("Failed to seed Tripwire dev repository.")
  }

  await db
    .insert(ruleConfigs)
    .values({
      repoId: repo.id,
      config: seededRuleConfig,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ruleConfigs.repoId,
      set: {
        config: seededRuleConfig,
        updatedAt: now,
      },
    })

  await db
    .insert(userPreferences)
    .values({
      userId: devUser.id,
      activeOrgId: DEV_BA_ORG_ID,
      activeRepoId: repo.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        activeOrgId: DEV_BA_ORG_ID,
        activeRepoId: repo.id,
        updatedAt: now,
      },
    })

  await db
    .insert(onboardingState)
    .values({
      userId: devUser.id,
      completedStep1: true,
      completedStep2: true,
      completedStep3: true,
      completedStep4: true,
      mainRepoId: repo.id,
      source: "other",
      setupAnswers: {
        useCases: ["ai_prs", "spam_issues"],
        priorIncident: "Seeded local demo workspace.",
        teamSize: "small",
      },
      gettingStartedDismissed: false,
      configuredRules: true,
      reviewedRiskAlerts: true,
      vouchedSomeone: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: onboardingState.userId,
      set: {
        completedStep1: true,
        completedStep2: true,
        completedStep3: true,
        completedStep4: true,
        mainRepoId: repo.id,
        configuredRules: true,
        reviewedRiskAlerts: true,
        vouchedSomeone: true,
        updatedAt: now,
      },
    })

  const [existingWorkflow] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.repoId, repo.id), eq(workflows.name, "Review new contributors")))
    .limit(1)

  if (existingWorkflow) {
    await db
      .update(workflows)
      .set({
        description: "Warn when a new pull request comes from a young account.",
        definition: seededWorkflowDefinition,
        enabled: true,
        updatedAt: now,
      })
      .where(eq(workflows.id, existingWorkflow.id))
  } else {
    await db.insert(workflows).values({
      repoId: repo.id,
      name: "Review new contributors",
      description: "Warn when a new pull request comes from a young account.",
      definition: seededWorkflowDefinition,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
  }

  const [existingCustomRule] = await db
    .select({ id: customRules.id })
    .from(customRules)
    .where(and(eq(customRules.repoId, repo.id), eq(customRules.name, "Urgent title check")))
    .limit(1)

  if (existingCustomRule) {
    await db
      .update(customRules)
      .set({
        description: "Flags titles that use urgency language.",
        definition: seededCustomRuleDefinition,
        action: "warn",
        enabled: true,
        priority: 10,
        updatedAt: now,
      })
      .where(eq(customRules.id, existingCustomRule.id))
  } else {
    await db.insert(customRules).values({
      repoId: repo.id,
      name: "Urgent title check",
      description: "Flags titles that use urgency language.",
      definition: seededCustomRuleDefinition,
      action: "warn",
      enabled: true,
      priority: 10,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db
    .insert(whitelistEntries)
    .values({
      repoId: repo.id,
      githubUsername: "trusted-maintainer",
      githubUserId: 91_001,
      addedById: devUser.id,
      createdAt: now,
    })
    .onConflictDoNothing()

  await db
    .insert(blacklistEntries)
    .values({
      repoId: repo.id,
      githubUsername: "drive-by-spammer",
      githubUserId: 91_002,
      addedById: devUser.id,
      createdAt: now,
    })
    .onConflictDoNothing()

  const seededPipelineIds = ["dev-seed-1", "dev-seed-2", "dev-seed-3"]
  await db.delete(events).where(inArray(events.pipelineId, seededPipelineIds))

  await db.insert(events).values([
    {
      repoId: repo.id,
      action: "pipeline_blocked",
      severity: "error",
      description: "@drive-by-spammer was blocked by the AI honeypot rule.",
      contentType: "pull_request",
      pipelineId: "dev-seed-1",
      ruleName: "AI honeypot",
      targetGithubUsername: "drive-by-spammer",
      targetGithubUserId: 91_002,
      githubRef: "PR #42",
      metadata: { title: "urgent fix", filesChanged: 18 },
      createdAt: now,
    },
    {
      repoId: repo.id,
      action: "pipeline_warned",
      severity: "warning",
      description: "@new-contributor triggered the account age warning.",
      contentType: "pull_request",
      pipelineId: "dev-seed-2",
      ruleName: "Account age",
      targetGithubUsername: "new-contributor",
      targetGithubUserId: 91_003,
      githubRef: "PR #43",
      metadata: { accountAgeDays: 6 },
      createdAt: now,
    },
    {
      repoId: repo.id,
      action: "whitelist_bypass",
      severity: "success",
      description: "@trusted-maintainer bypassed checks from the whitelist.",
      contentType: "comment",
      pipelineId: "dev-seed-3",
      targetGithubUsername: "trusted-maintainer",
      targetGithubUserId: 91_001,
      githubRef: "Comment #44",
      metadata: { source: "dev-seed" },
      createdAt: now,
    },
  ])

  return {
    userId: devUser.id,
    orgId: DEV_BA_ORG_ID,
    repoId: repo.id,
  }
}
