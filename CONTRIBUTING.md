# Contributing to Daleel Backend

## Getting Started

See the [README](./README.md) for installation and setup instructions.

## Development Workflow

### Branch Naming

```
feat/<short-description>     # New features
fix/<short-description>      # Bug fixes
refactor/<short-description> # Code refactoring
docs/<short-description>     # Documentation changes
chore/<short-description>    # Tooling, dependencies, config
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add mentor search endpoint
fix: correct JWT expiration check
refactor: extract scheduling logic into service
docs: update API examples in README
chore: upgrade Prisma to v7.11
```

### Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes — keep PRs focused and small.
3. Ensure all checks pass locally:
   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```
4. Open a PR with a clear title (follows commit message format) and description.
5. Request a review.
6. Squash-merge into `main` once approved.

## Git Hooks

Husky + lint-staged run automatically on every commit:

- **Pre-commit**: Lints and formats staged files.

No need to run these manually — they'll catch issues before they reach the PR.

## Code Quality

| Tool     | Purpose              | Command         |
| -------- | -------------------- | --------------- |
| OxLint   | Linting (type-aware) | `pnpm lint`     |
| Prettier | Formatting           | `pnpm format`   |
| Vitest   | Unit tests           | `pnpm test`     |
| Vitest   | E2E tests            | `pnpm test:e2e` |

## Database Changes

- All schema changes go through Prisma migrations.
- Run `pnpm prisma:migrate:dev` to create a new migration.
- Never edit migration files after they've been committed.
- Run `pnpm prisma:generate` after pulling new migrations.
