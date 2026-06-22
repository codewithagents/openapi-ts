## Summary

<!-- Describe what this PR does and why. One paragraph is enough. -->

## Changes

<!-- Bullet list of the main changes. -->

-

## Checklist

- [ ] PR title follows Conventional Commits format: `type(scope): description` (e.g. `feat(openapi-zod-ts): ...`, `fix(api-errors): ...`). The squashed commit subject is what Release Please reads to decide version bumps, so the scope must match the package name exactly.
- [ ] Tests added or updated for all changed behaviour. Bug fixes include a regression test.
- [ ] If generated output changed intentionally, snapshots updated: `pnpm --filter <package> test -- -u` and the updated snapshot files are committed.
- [ ] `pnpm -r run lint` passes (TypeScript strict mode, no type errors).
- [ ] `pnpm fallow:audit` is clean (no dead code, duplication, or unresolved imports flagged in the diff).
- [ ] No manual version bumps. Release Please handles all versioning from commit messages. If a major bump is needed, confirm with a maintainer before merging.
- [ ] If this PR adds a new published package, the package entry is added to `release-please-config.json`, `.release-please-manifest.json`, and `.github/workflows/release.yml`.

## Testing

<!-- How did you test this? Which commands did you run? -->

```bash
pnpm --filter <package> test
pnpm --filter <package> test:coverage
pnpm fallow:audit
```
