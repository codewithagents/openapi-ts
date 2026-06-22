# CodeWithAgents OpenAPI

<p align="center">
  <img src="docs/public/media/openapi-zod-ts-demo.gif" alt="One OpenAPI 3.1 spec generates a typed fetch client, Zod schemas, React Query hooks, MSW mocks, and a server interface" width="800">
</p>

[![CI](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/ci.yml)
[![CodeQL](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml/badge.svg)](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?branch=main)](https://codecov.io/gh/codewithagents/openapi-zod-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./packages/openapi-zod-ts/LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/openapi-zod-ts.svg)](https://npmjs.com/package/openapi-zod-ts)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/openapi-zod-ts)](https://bundlephobia.com/package/openapi-zod-ts)
[![GitHub stars](https://img.shields.io/github/stars/codewithagents/openapi-zod-ts)](https://github.com/codewithagents/openapi-zod-ts/stargazers)

> OpenAPI to TypeScript you actually own. Native `fetch` client, React Query hooks, and Zod schemas you can extend, from one OpenAPI 3.1 spec. Zero runtime dependencies.

**Documentation:** https://openapi.codewithagents.de

Sibling project: [openapi-laravel](https://github.com/codewithagents/openapi-laravel) does the same for PHP/Laravel.

You consume a REST API. You need TypeScript types, a fetch client, form error mapping, and React Query hooks. Instead of hand-writing all of this (and keeping it in sync every time the spec changes), you run one command. Everything here is a `devDependency` or generates code that only depends on what your project already has.

Unlike most generators, the output is not a black box you regenerate and forget. The Zod schema file is bootstrapped once and then yours to extend, regen never overwrites it, and the generated client uses only native `fetch`. See [how it compares](https://openapi.codewithagents.de/comparison) to hey-api, orval, kubb, and openapi-fetch.

---

## Packages

| Package | Version | Coverage | Description |
|---|---|---|---|
| [`@codewithagents/api-errors`](./packages/api-errors) | [![npm](https://img.shields.io/npm/v/@codewithagents/api-errors.svg)](https://npmjs.com/package/@codewithagents/api-errors) | [![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=api-errors&branch=main)](https://codecov.io/gh/codewithagents/openapi-zod-ts) | Map API error responses to form field errors, framework-agnostic core + React Hook Form adapter |
| [`openapi-zod-ts`](./packages/openapi-zod-ts) | [![npm](https://img.shields.io/npm/v/openapi-zod-ts.svg)](https://npmjs.com/package/openapi-zod-ts) | [![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=openapi-zod-ts&branch=main)](https://codecov.io/gh/codewithagents/openapi-zod-ts) | Generate TypeScript models + native `fetch` client + Zod schemas from an OpenAPI 3.1 spec (3.0.x supported) |
| [`@codewithagents/openapi-react-query`](./packages/openapi-react-query) | [![npm](https://img.shields.io/npm/v/@codewithagents/openapi-react-query.svg)](https://npmjs.com/package/@codewithagents/openapi-react-query) | [![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=openapi-react-query&branch=main)](https://codecov.io/gh/codewithagents/openapi-zod-ts) | Generate typed React Query v5 hooks: `useQuery`, `useMutation`, key factories |
| [`@codewithagents/openapi-server`](./packages/openapi-server) | [![npm](https://img.shields.io/npm/v/@codewithagents/openapi-server.svg)](https://npmjs.com/package/@codewithagents/openapi-server) | [![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=openapi-server&branch=main)](https://codecov.io/gh/codewithagents/openapi-zod-ts) | Generate a framework-agnostic service interface from OpenAPI 3.1, plus an optional router for Hono, Express, or Fastify (default: none, wire to any framework you choose) |
| [`@codewithagents/openapi-msw`](./packages/openapi-msw) | [![npm](https://img.shields.io/npm/v/@codewithagents/openapi-msw.svg)](https://npmjs.com/package/@codewithagents/openapi-msw) | [![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=openapi-msw&branch=main)](https://codecov.io/gh/codewithagents/openapi-zod-ts) | Generate MSW v2 HTTP handlers with seeded Faker mock data from an OpenAPI 3.1 spec |

Each package has its own README with full usage docs and configuration reference.

---

## Full pipeline

One spec, four generators:

```
spec/api.json
  ├── openapi-zod-ts       → models.ts, client.ts   (TypeScript types + fetch client)
  ├── openapi-server       → service.ts             (framework-agnostic service interface)
  │                          router.ts              (optional: Hono, Express, or Fastify; default none)
  ├── openapi-react-query  → hooks.ts               (React Query v5 hooks)
  └── openapi-msw          → handlers.ts            (MSW v2 mock handlers + seeded Faker data)
```

`@codewithagents/api-errors` is the runtime helper that sits alongside this output, mapping backend error responses onto form fields. It is not a codegen step.

You write: your business logic (implement the service interface).
Everything else is generated and stays in sync when the spec changes.

---

## Philosophy

**Zero footprint.** Every package is a `devDependency` or generates code that uses only what your project already has. We never add a runtime dependency you didn't choose.

**Latest only.** TypeScript 6 (actively supported), OpenAPI 3.1 (3.1.1 primary target, 3.0.x supported in practice), Zod v4, React Query v5. No legacy shims, no backports. Opinionated cuts mean less code, faster iteration, and a clear upgrade path.

**You own the output.** The Zod schema file is bootstrapped once and never overwritten. Add your own validation rules, error messages, and business logic. The generator treats your file as source of truth.

**Readable output.** Generated code looks like code you'd write yourself, no opaque abstractions, no minified magic. You can read it, review it, and commit it.

**Agent-friendly.** One `devDependency`, one command, a fully-typed API client with runtime validation. Designed to work well when an AI agent is building or maintaining your project.

---

## How it compares

[hey-api](https://heyapi.dev/), [orval](https://orval.dev/), [kubb](https://kubb.dev/), and [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) are all good, actively maintained tools, and in some areas more featureful than this one. The honest trade-off: we are smaller and more opinionated, and we trade breadth for ownership and stability.

| | `openapi-zod-ts` | hey-api | orval | kubb | openapi-fetch |
|---|---|---|---|---|---|
| Runtime library added to your app | None (native `fetch`) | None (bundled) | Mutator (often axios) | Client of choice | ~6 kb required |
| Zod schema file you own, never overwritten | **Yes** | No | No | No | n/a |
| Runtime request + response validation | Yes | Yes | Yes | Yes | No |
| React Query hooks | Yes (React) | Yes (multi) | Yes (multi) | Yes (React, Vue, SWR) | Companion pkg |
| Server-side service interface + router | **Yes** (Hono, Express, Fastify) | No | No | No | No |
| Mocks (MSW / faker) | **Yes** (openapi-msw, MSW v2 + Faker) | Yes | Yes | Yes | No |
| Swagger 2.0 | No | No | Yes | Yes | No |
| Stable 1.0+ release | Yes (2.x) | No (0.x) | Yes | Yes | Yes |

**Pick something else if** your frontend is Vue/Svelte/Angular (hey-api, orval, kubb), you have a Swagger 2.0 spec (orval, kubb), or you want the largest ecosystem (hey-api). Full breakdown, including where the alternatives win: **[How it compares](https://openapi.codewithagents.de/comparison)**.

---

## Why quality matters

Code generators have a wide blast radius. A subtle regression in the generator touches every project that runs it. These are the layers we use to catch problems before they reach you.

**Near-100% test coverage.** Every published package runs at ~100% statements, functions, and lines. Branches sit at 99%+ across the board. The remaining gap is a handful of genuinely unreachable defensive guards (`?? fallback` patterns where the fallback can never trigger by construction). Coverage is tracked per-package via [Codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts) and blocks PRs when it drops.

**128 real-world OpenAPI specs.** The generator runs against a [compatibility matrix](./examples/) of 128 publicly available specs: Stripe, GitHub, Google Calendar, Spotify, Twitter/X, OpenAI, Adyen, Slack, Vercel, Cloudflare, Twilio, Plaid, Notion, Jira, Okta, and more. **128/128 generate without errors** on every PR. The 13 showcase specs (`1Password Connect`, `Adyen Checkout`, `Adyen Legal Entity`, `Canada Holidays`, `Dev.to`, `Exchange Rate`, `Open-Meteo`, `OpenAI`, `Petstore`, `Redocly Museum`, `Resend`, `Spotify`, `Twitter`) have committed output and are drift-checked on every relevant PR. If anything regresses, CI fails.

**Smoke tests against live public APIs.** The generated client code fires real HTTP requests against public no-auth APIs (Open-Meteo, Canada Holidays, Exchange Rate API, D&D 5e) on every push to main and weekly on a schedule. This is the generated code itself making network calls, not just checking that it compiles. If the generator produces a client that breaks at runtime, the smoke suite catches it.

**Mutation testing with Stryker.** `openapi-zod-ts` and `openapi-react-query` run [Stryker](https://stryker-mutator.io/) mutation tests locally. Mutation testing deliberately introduces bugs into the source code and verifies that the test suite catches them. High line coverage that doesn't actually catch regressions shows up here.

**Full-stack E2E tests.** The [`petstore-fastify`](./packages/petstore-fastify) package is the canonical runnable full-stack reference: one shared spec drives generated types, fetch client, React Query hooks, and a Fastify server with `createContext` auth and a cross-field validation rule. A React + react-query frontend logs in for a bearer token, then submits a secured `/contact` form whose cross-field error round-trips back onto the right form field. [Playwright](https://playwright.dev/) e2e runs the full loop on every PR: spec change to browser assertion. The legacy [`petstore-hono`](./packages/petstore-hono) package is retained as a Hono surface for coverage.

**Static analysis on every PR.** [Fallow](https://github.com/fallow-rs/fallow) runs on every pull request and posts inline review comments flagging dead code, duplication, and unresolved imports introduced by the diff. [CodeQL](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml) handles security scanning.

See [`examples/README.md`](./examples/README.md) for the full compatibility breakdown.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Sponsors

This project is MIT-licensed and free to use. If it saves you time, consider sponsoring:

[![GitHub Sponsors](https://img.shields.io/github/sponsors/codewithagents?style=flat&logo=github)](https://github.com/sponsors/codewithagents)

---

## License

[MIT](./packages/openapi-zod-ts/LICENSE) © codewithagents
