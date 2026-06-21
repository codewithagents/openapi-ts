# packages

This directory contains all packages in the `openapi-zod-ts` monorepo.

## Published packages

Five packages ship to npm: four generators that emit files from one OpenAPI 3.1 spec (openapi-zod-ts, openapi-server, openapi-react-query, openapi-msw) plus one runtime helper used in app code (api-errors).

| Package | Version | Description |
|---|---|---|
| [`openapi-zod-ts`](./openapi-zod-ts) | [![npm](https://img.shields.io/npm/v/openapi-zod-ts.svg)](https://npmjs.com/package/openapi-zod-ts) | Generate TypeScript models, a native fetch client, and Zod schemas from OpenAPI 3.1 |
| [`openapi-server`](./openapi-server) | [![npm](https://img.shields.io/npm/v/@codewithagents/openapi-server.svg)](https://npmjs.com/package/@codewithagents/openapi-server) | Generate a framework-agnostic service interface plus an optional Hono/Express/Fastify router from OpenAPI 3.1 |
| [`openapi-react-query`](./openapi-react-query) | [![npm](https://img.shields.io/npm/v/@codewithagents/openapi-react-query.svg)](https://npmjs.com/package/@codewithagents/openapi-react-query) | Generate typed React Query v5 hooks from OpenAPI 3.1 |
| [`openapi-msw`](./openapi-msw) | [![npm](https://img.shields.io/npm/v/@codewithagents/openapi-msw.svg)](https://npmjs.com/package/@codewithagents/openapi-msw) | Generate MSW v2 HTTP handlers with seeded Faker mock data from OpenAPI 3.1 |
| [`api-errors`](./api-errors) | [![npm](https://img.shields.io/npm/v/@codewithagents/api-errors.svg)](https://npmjs.com/package/@codewithagents/api-errors) | Map backend API error responses to form field errors |

## Private packages

These are not published. They cover the shared contract, integration tests, and the example apps.

| Package | Description |
|---|---|
| [`integration`](./integration) | Cross-package integration tests with committed, drift-checked sample output |
| [`petstore-shared`](./petstore-shared) | The shared pet OpenAPI spec plus hand-written Zod schemas, the contract the example apps reuse via relative config paths |
| [`petstore-fastify`](./petstore-fastify) | Canonical full-stack reference: Fastify, createContext auth, a cross-field validation rule, a React frontend, and browser e2e |
| [`petstore-hono`](./petstore-hono) | Retained legacy Hono full-stack surface (Hono, React, react-query e2e) |
| [`petstore-express`](./petstore-express) | Thin Express backend smoke (inject test plus typecheck) |
| [`petstore-contract`](./petstore-contract) | Uniform real-HTTP contract harness proving one API contract holds identically across the Fastify, Hono, and Express adapters |

## How they fit together

```
spec/api.json
  ├── openapi-zod-ts       → models.ts, client.ts, schemas.ts   TypeScript types + fetch client + Zod
  ├── openapi-server       → service.ts, router.ts              Service interface + optional router (hono/express/fastify/none, default none)
  ├── openapi-react-query  → hooks.ts                           React Query v5 hooks
  └── openapi-msw          → handlers.ts                        MSW v2 mock handlers with seeded Faker data

You write: business logic only (implement the service interface).
```

See the [petstore-fastify](./petstore-fastify) package for a working full-stack example of the pipeline, the canonical reference app.
