## Median Tasks

Before starting work, check your assigned tasks:

```
mdn tasks --agent <your-agent-name>
```

When picking up a task:

```
mdn status <TASK-CODE> in_progress --agent <your-agent-name>
```

When completing a task:

```
mdn status <TASK-CODE> ready --agent <your-agent-name>
```

To create a new task:

```
mdn create --title "Description" --status todo --priority medium --agent <your-agent-name>
```

## Code Style

- No helper functions inside components or tool files. Put them in `apps/web/src/lib/` or `packages/*/src/` utils.
- Use the shared utilities in `apps/web/src/lib/format.ts` for formatting (camelCase labels, compact numbers, etc.)
- No ASCII divider comments (`// ─── Section Name ───────`). Use whitespace and clear naming instead.
- No decorative multi-line doc comments that just describe a section. Only use JSDoc on exported functions/types.

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles so tasks get marked automatically.

```
git commit -m "MDN-42 fix: resolve auth token expiry"
```

For pull requests, include the task ID in the title:

```
MDN-42 fix: resolve auth token expiry
```
