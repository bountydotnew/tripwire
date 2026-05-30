import { ensureDevLoginUser, seedDevWorkspace } from "#/lib/dev-seed"

const user = await ensureDevLoginUser()
const seeded = await seedDevWorkspace()

console.info(
  `Seeded dev login for ${user.id}: org ${seeded.orgId}, repo ${seeded.repoId}`
)
