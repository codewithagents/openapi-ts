# Security Policy

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately via GitHub's [Security Advisories](../../security/advisories/new) feature.

We will respond within 48 hours and aim to release a fix within 7 days for confirmed issues.

## Security regression tests

This toolchain generates code from untrusted OpenAPI specs, so the primary threat
class is spec-driven code injection (a hostile spec value breaking out of a generated
string literal and injecting executable code). We guard this with dedicated regression
tests, kept discoverable by convention:

- **Files:** `packages/*/src/__tests__/security-escape.test.ts`
- **Describe blocks:** every block label is prefixed with `SECURITY:`
- **What they assert:** adversarial spec values (quotes, backticks, `${`, newlines in
  paths, enum values, header names, resource names) appear in generated output only as
  safely-escaped string literals, never as injected statements.

Run only the security tests across all packages:

```
pnpm -r test -t SECURITY
```

When adding a new generator code path that emits a spec-derived string, add a matching
`SECURITY:` test that feeds an adversarial payload through it.

## Automated security

Two safeguards run without manual intervention:

- **Static analysis:** [CodeQL](.github/workflows/codeql.yml) scans every pull request
  for security issues before merge.
- **Supply chain:** all five published packages (`openapi-zod-ts`,
  `@codewithagents/openapi-react-query`, `@codewithagents/openapi-server`,
  `@codewithagents/openapi-msw`, and `@codewithagents/api-errors`) publish to npm via
  OIDC Trusted Publishing. There is no long-lived npm token stored in the repository or
  CI to leak.
