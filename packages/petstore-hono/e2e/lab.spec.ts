/**
 * Lab contract suite — Phase 1
 *
 * Ports the proven openapi-laravel /lab/* tests to our Hono harness.
 *
 * Key differences from the laravel suite:
 *  - LAB_OK = 200 (our generator returns 200 for 200-with-content responses).
 *  - 422 error body is { error, issues } (Zod), NOT { message, errors }.
 *    All body.errors.<field> assertions are dropped; only status or issues[].path
 *    are asserted where needed.
 *  - Base URL: http://localhost:3001/api (no /v1 prefix).
 *  - Body validation is HAND-WRITTEN Zod in src/schemas.ts; the generator wires
 *    safeParse only for $ref-based request bodies, not inline schemas.
 */

import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:3001/api'
const LAB_BASE = `${API_BASE}/lab`
const LAB_OK = 200

/** POST JSON to a /lab endpoint and return { status, body }. */
async function labPost(
  request: import('@playwright/test').APIRequestContext,
  endpoint: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`${LAB_BASE}/${endpoint}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: payload as Record<string, unknown>,
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status(), body }
}

/** GET a /lab endpoint and return { status, body }. */
async function labGet(
  request: import('@playwright/test').APIRequestContext,
  pathAndQuery: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await request.get(`${LAB_BASE}/${pathAndQuery}`, {
    headers: { Accept: 'application/json', ...extraHeaders },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status(), body }
}

// ===========================================================================
// A. CONSTRAINT ROUND-TRIPS
// ===========================================================================

test('lab/numeric: bounds, exclusive bounds, and multipleOf round-trip and reject', async ({
  request,
}) => {
  const ok = await labPost(request, 'numeric', { bounded: 15, exclusive: 0.5, multiple: 25 })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ bounded: 15, exclusive: 0.5, multiple: 25 })

  // minimum / maximum
  expect((await labPost(request, 'numeric', { bounded: 9, exclusive: 0.5, multiple: 25 })).status).toBe(422)
  expect((await labPost(request, 'numeric', { bounded: 21, exclusive: 0.5, multiple: 25 })).status).toBe(422)
  // exclusiveMinimum / exclusiveMaximum — boundary values are rejected
  expect((await labPost(request, 'numeric', { bounded: 15, exclusive: 0, multiple: 25 })).status).toBe(422)
  expect((await labPost(request, 'numeric', { bounded: 15, exclusive: 1, multiple: 25 })).status).toBe(422)
  // multipleOf
  expect((await labPost(request, 'numeric', { bounded: 15, exclusive: 0.5, multiple: 23 })).status).toBe(422)
})

test('lab/string: minLength, maxLength, and pattern round-trip and reject', async ({ request }) => {
  const ok = await labPost(request, 'string', { sized: 'hello', coded: 'AB-1234' })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ sized: 'hello', coded: 'AB-1234' })

  expect((await labPost(request, 'string', { sized: 'ab', coded: 'AB-1234' })).status).toBe(422) // min:3
  expect((await labPost(request, 'string', { sized: 'toolongvalue', coded: 'AB-1234' })).status).toBe(422) // max:8
  expect((await labPost(request, 'string', { sized: 'hello', coded: 'bad-code' })).status).toBe(422) // pattern
})

test('lab/array: minItems, maxItems, and uniqueItems round-trip and reject', async ({ request }) => {
  const ok = await labPost(request, 'array', { bag: ['a', 'b'], distinct: [1, 2, 3] })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ bag: ['a', 'b'], distinct: [1, 2, 3] })

  expect((await labPost(request, 'array', { bag: ['a'], distinct: [1] })).status).toBe(422) // minItems
  expect((await labPost(request, 'array', { bag: ['a', 'b', 'c', 'd', 'e'], distinct: [1] })).status).toBe(422) // maxItems
  expect((await labPost(request, 'array', { bag: ['a', 'b'], distinct: [1, 1, 2] })).status).toBe(422) // uniqueItems
})

test('lab/enum-const: enum membership and const round-trip and reject', async ({ request }) => {
  const ok = await labPost(request, 'enum-const', { color: 'green', version: 'v2' })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ color: 'green', version: 'v2' })

  expect((await labPost(request, 'enum-const', { color: 'purple', version: 'v2' })).status).toBe(422) // enum
  expect((await labPost(request, 'enum-const', { color: 'green', version: 'v1' })).status).toBe(422) // const
})

test('lab/closed: additionalProperties:false rejects an unknown key', async ({ request }) => {
  const ok = await labPost(request, 'closed', { known: 'yes' })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ known: 'yes' })

  expect((await labPost(request, 'closed', { known: 'yes', surprise: 'boom' })).status).toBe(422)
})

test('lab/presence: required, nullable, optional, and default behave per contract', async ({
  request,
}) => {
  // Omitting optional/nullable/withDefault: they resolve to their defaults
  const omitted = await labPost(request, 'presence', { mandatory: 'here' })
  expect(omitted.status).toBe(LAB_OK)
  expect(omitted.body).toMatchObject({
    mandatory: 'here',
    nullableField: null,
    withDefault: 'fallback',
  })

  // Missing required field 422s
  expect((await labPost(request, 'presence', { nullableField: 'x' })).status).toBe(422)

  // Explicit null on nullable field is accepted and stays null
  const explicitNull = await labPost(request, 'presence', { mandatory: 'here', nullableField: null })
  expect(explicitNull.status).toBe(LAB_OK)
  expect((explicitNull.body as Record<string, unknown>).nullableField).toBeNull()

  // Overriding the default is honored
  const overridden = await labPost(request, 'presence', { mandatory: 'here', withDefault: 'custom' })
  expect((overridden.body as Record<string, unknown>).withDefault).toBe('custom')
})

// ===========================================================================
// B. MAPS
// ===========================================================================

test('lab/map: typed additionalProperties map round-trips, empty map serializes as {} not []', async ({
  request,
}) => {
  const nonEmpty = await labPost(request, 'map', { label: 'x', counts: { a: 1, b: 2 } })
  expect(nonEmpty.status).toBe(LAB_OK)
  expect((nonEmpty.body as Record<string, unknown>).counts).toEqual({ a: 1, b: 2 })

  // Wire-format assertion: empty map must be {} not []
  const emptyRes = await request.post(`${LAB_BASE}/map`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: { label: 'x', counts: {} },
  })
  expect(emptyRes.status()).toBe(LAB_OK)
  const emptyText = await emptyRes.text()
  expect(emptyText).toContain('"counts":{}')
  expect(emptyText).not.toContain('"counts":[]')

  // Non-integer map value 422s
  expect((await labPost(request, 'map', { label: 'x', counts: { a: 'bad' } })).status).toBe(422)
})

test('lab/empty-map: GET returns LabMap with counts:{} on the wire (response-side serialization)', async ({
  request,
}) => {
  const res = await request.get(`${LAB_BASE}/empty-map`, {
    headers: { Accept: 'application/json' },
  })
  expect(res.status()).toBe(LAB_OK)
  const text = await res.text()
  expect(text).toContain('"counts":{}')
  expect(text).not.toContain('"counts":[]')
  const body = (await res.json()) as Record<string, unknown>
  expect(body.label).toBe('empty')
  expect(body.counts).toEqual({})
  expect(Array.isArray(body.counts)).toBe(false)
})

// ===========================================================================
// C. SCALAR UNIONS
// ===========================================================================

test('lab/union: oneOf scalar union hydrates BOTH variants without coercion', async ({ request }) => {
  const asString = await labPost(request, 'union', { value: 'hello' })
  expect(asString.status).toBe(LAB_OK)
  expect((asString.body as Record<string, unknown>).value).toBe('hello')
  expect(typeof (asString.body as Record<string, unknown>).value).toBe('string')

  const asInt = await labPost(request, 'union', { value: 42 })
  expect(asInt.status).toBe(LAB_OK)
  expect((asInt.body as Record<string, unknown>).value).toBe(42)
  expect(typeof (asInt.body as Record<string, unknown>).value).toBe('number') // stays 42, not "42"
})

test('lab/anyof-union: anyOf scalar union hydrates BOTH variants without coercion', async ({
  request,
}) => {
  const asBool = await labPost(request, 'anyof-union', { value: true })
  expect(asBool.status).toBe(LAB_OK)
  expect((asBool.body as Record<string, unknown>).value).toBe(true)
  expect(typeof (asBool.body as Record<string, unknown>).value).toBe('boolean')

  const asInt = await labPost(request, 'anyof-union', { value: 7 })
  expect(asInt.status).toBe(LAB_OK)
  expect((asInt.body as Record<string, unknown>).value).toBe(7)
  expect(typeof (asInt.body as Record<string, unknown>).value).toBe('number')
})

// ===========================================================================
// D. DISCRIMINATED UNIONS
// ===========================================================================

test('lab/shape: discriminated object union hydrates each variant by discriminator', async ({
  request,
}) => {
  // circle variant
  const circle = await labPost(request, 'shape', { kind: 'circle', radius: 2.5 })
  expect(circle.status).toBe(LAB_OK)
  const circleBody = circle.body as Record<string, unknown>
  expect(circleBody.kind).toBe('circle')
  expect(circleBody.radius).toBe(2.5)
  expect(circleBody.side).toBeUndefined()

  // square variant
  const square = await labPost(request, 'shape', { kind: 'square', side: 3 })
  expect(square.status).toBe(LAB_OK)
  const squareBody = square.body as Record<string, unknown>
  expect(squareBody.kind).toBe('square')
  expect(squareBody.side).toBe(3)
  expect(squareBody.radius).toBeUndefined()

  // variant-specific rule: circle.radius > 0 (gt:0)
  expect((await labPost(request, 'shape', { kind: 'circle', radius: 0 })).status).toBe(422)
  // missing variant field
  expect((await labPost(request, 'shape', { kind: 'circle' })).status).toBe(422)
})

test('lab/shape: unknown discriminator value is rejected with 422', async ({ request }) => {
  const unknown = await labPost(request, 'shape', { kind: 'triangle', radius: 1 })
  expect(unknown.status).toBe(422)
})

test('lab/inline-shape: inline discriminated union hydrates by discriminator with synthesized names', async ({
  request,
}) => {
  const dog = await labPost(request, 'inline-shape', { petType: 'dog', bark: 'woof' })
  expect(dog.status).toBe(LAB_OK)
  const dogBody = dog.body as Record<string, unknown>
  expect(dogBody.petType).toBe('dog')
  expect(dogBody.bark).toBe('woof')
  expect(dogBody.meow).toBeUndefined()

  const cat = await labPost(request, 'inline-shape', { petType: 'cat', meow: 'mrr' })
  expect(cat.status).toBe(LAB_OK)
  const catBody = cat.body as Record<string, unknown>
  expect(catBody.petType).toBe('cat')
  expect(catBody.meow).toBe('mrr')
  expect(catBody.bark).toBeUndefined()

  // unknown discriminator value is a clean 422
  expect((await labPost(request, 'inline-shape', { petType: 'fish', bark: 'x' })).status).toBe(422)
})

test('lab/inline-shape: missing discriminator field is rejected with 422', async ({ request }) => {
  expect((await labPost(request, 'inline-shape', { bark: 'woof' })).status).toBe(422)
})

test('lab/inherit-shape: allOf-inheritance discriminated union hydrates each variant', async ({
  request,
}) => {
  const car = await labPost(request, 'inherit-shape', { vehicleType: 'car', wheels: 4 })
  expect(car.status).toBe(LAB_OK)
  const carBody = car.body as Record<string, unknown>
  expect(carBody.vehicleType).toBe('car')
  expect(carBody.wheels).toBe(4)
  expect(carBody.draft).toBeUndefined()

  const boat = await labPost(request, 'inherit-shape', { vehicleType: 'boat', draft: 1.5 })
  expect(boat.status).toBe(LAB_OK)
  const boatBody = boat.body as Record<string, unknown>
  expect(boatBody.vehicleType).toBe('boat')
  expect(boatBody.draft).toBe(1.5)
  expect(boatBody.wheels).toBeUndefined()

  // variant-specific rule: car.wheels min:3
  expect((await labPost(request, 'inherit-shape', { vehicleType: 'car', wheels: 2 })).status).toBe(422)
  // unknown discriminator value is a clean 422
  expect((await labPost(request, 'inherit-shape', { vehicleType: 'plane', wheels: 4 })).status).toBe(422)
})

test('lab/inherit-shape: missing discriminator field is rejected with 422', async ({ request }) => {
  expect((await labPost(request, 'inherit-shape', { wheels: 4 })).status).toBe(422)
})

test('lab/response-union: selector enum routes to the correct shape', async ({ request }) => {
  const circle = await labPost(request, 'response-union', { want: 'circle' })
  expect(circle.status).toBe(LAB_OK)
  const circleBody = circle.body as Record<string, unknown>
  expect(circleBody.kind).toBe('circle')
  expect(circleBody.radius).toBe(1.5)
  expect(circleBody.side).toBeUndefined()

  const square = await labPost(request, 'response-union', { want: 'square' })
  expect(square.status).toBe(LAB_OK)
  const squareBody = square.body as Record<string, unknown>
  expect(squareBody.kind).toBe('square')
  expect(squareBody.side).toBe(4)
  expect(squareBody.radius).toBeUndefined()

  // selector enum is validated: invalid want 422s
  expect((await labPost(request, 'response-union', { want: 'hexagon' })).status).toBe(422)
})

// ===========================================================================
// E. BACKED-ENUM / TUPLE / ALLOF
// ===========================================================================

test('lab/backed-enum: a named string enum component round-trips and rejects out-of-enum', async ({
  request,
}) => {
  const ok = await labPost(request, 'backed-enum', { priority: 'high' })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ priority: 'high' })

  expect((await labPost(request, 'backed-enum', { priority: 'urgent' })).status).toBe(422)
})

test('lab/tuple: prefixItems validate per position and the value round-trips', async ({ request }) => {
  const ok = await labPost(request, 'tuple', { pair: ['hi', 5] })
  expect(ok.status).toBe(LAB_OK)
  expect((ok.body as Record<string, unknown>).pair).toEqual(['hi', 5])

  // position 1 is typed integer (a string at that position 422s)
  expect((await labPost(request, 'tuple', { pair: ['hi', 'notint'] })).status).toBe(422)
  // position 1 carries per-position min:0 rule
  expect((await labPost(request, 'tuple', { pair: ['hi', -3] })).status).toBe(422)
})

test('lab/allof: allOf merged-flat object round-trips both branches and rejects a missing field', async ({
  request,
}) => {
  const ok = await labPost(request, 'allof', { baseField: 'b', extraField: 7 })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ baseField: 'b', extraField: 7 })

  expect((await labPost(request, 'allof', { extraField: 7 })).status).toBe(422) // missing base branch
  expect((await labPost(request, 'allof', { baseField: 'b' })).status).toBe(422) // missing extra branch
})

// ===========================================================================
// F. PET READ/WRITE SPLIT: nested-variant and inline-response
// ===========================================================================

test('lab/nested-variant: writeOnly secret is absent from response, readOnly serverId is server-set', async ({
  request,
}) => {
  const res = await request.post(`${LAB_BASE}/nested-variant`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: {
      title: 'recursion',
      items: [
        { name: 'first', secret: 'WRITEONLY-MUST-NOT-LEAK-1', serverId: 'CLIENT-RO-1' },
        { name: 'second', secret: 'WRITEONLY-MUST-NOT-LEAK-2', serverId: 'CLIENT-RO-2' },
      ],
    },
  })
  expect(res.status()).toBe(LAB_OK)
  const body = (await res.json()) as Record<string, unknown>
  const rawText = await res.text()

  expect(body.title).toBe('recursion')
  expect(Array.isArray(body.items)).toBe(true)
  const items = body.items as Array<Record<string, unknown>>
  expect(items).toHaveLength(2)

  // (a) writeOnly secret: absent from the read response by key and by value
  for (const item of items) {
    expect(item).not.toHaveProperty('secret')
  }
  expect(rawText).not.toContain('WRITEONLY-MUST-NOT-LEAK-1')
  expect(rawText).not.toContain('WRITEONLY-MUST-NOT-LEAK-2')

  // (b) readOnly serverId: client-sent value must NOT appear; server-assigned one must be present
  expect(rawText).not.toContain('CLIENT-RO-1')
  expect(rawText).not.toContain('CLIENT-RO-2')
  for (const item of items) {
    expect(item.serverId).toBeDefined()
    expect(item.serverId).not.toBe('CLIENT-RO-1')
    expect(item.serverId).not.toBe('CLIENT-RO-2')
  }
})

test('lab/inline-response: GET returns readOnly field present, writeOnly internal_token absent', async ({
  request,
}) => {
  const res = await request.get(`${LAB_BASE}/inline-response`, {
    headers: { Accept: 'application/json' },
  })
  expect(res.status()).toBe(LAB_OK)
  const body = (await res.json()) as Record<string, unknown>
  // readOnly generated_at is present
  expect(body.label).toBe('inline')
  expect(body.generated_at).toBeDefined()
  // writeOnly internal_token is absent — assert both parsed and raw text
  expect(body).not.toHaveProperty('internal_token')
  const text = await res.text()
  expect(text).not.toContain('internal_token')
})

// ===========================================================================
// G. LOOSE UNION (presence-only)
// ===========================================================================

test('lab/loose-union: undiscriminated object union is presence-only (accepts any payload)', async ({
  request,
}) => {
  // Variant A shape is accepted and round-trips
  const a = await labPost(request, 'loose-union', { payload: { alpha: 'hello' } })
  expect(a.status).toBe(LAB_OK)
  expect(a.body).toEqual({ payload: { alpha: 'hello' } })

  // Variant B shape is also accepted
  const b = await labPost(request, 'loose-union', { payload: { beta: 42 } })
  expect(b.status).toBe(LAB_OK)
  expect(b.body).toEqual({ payload: { beta: 42 } })

  // Neither variant's required field: still accepted (presence-only on `payload`)
  const neither = await labPost(request, 'loose-union', { payload: { gamma: true } })
  expect(neither.status).toBe(LAB_OK)
  expect(neither.body).toEqual({ payload: { gamma: true } })

  // Missing payload entirely: 422 (the only rule is presence)
  expect((await labPost(request, 'loose-union', {})).status).toBe(422)
})

// ===========================================================================
// H. QUERY PARAMS — enum+required legs only (Phase 1)
// Min/max/pattern are Phase 2 (generator does not validate those on query params)
// ===========================================================================

test('lab/query: required query params missing → 422; valid params → 200 echo', async ({
  request,
}) => {
  // Valid: all three required params present
  const ok = await labGet(request, 'query?tier=gold&count=50&code=ABC')
  expect(ok.status).toBe(LAB_OK)
  // Echo: tier (string), count (number), code (string)
  const okBody = ok.body as Record<string, unknown>
  expect(okBody.tier).toBe('gold')
  expect(okBody.count).toBe(50)
  expect(okBody.code).toBe('ABC')

  // Missing required tier → 422
  expect((await labGet(request, 'query?count=50&code=ABC')).status).toBe(422)
  // Missing required count → 422
  expect((await labGet(request, 'query?tier=gold&code=ABC')).status).toBe(422)
  // Missing required code → 422
  expect((await labGet(request, 'query?tier=gold&count=50')).status).toBe(422)
})

test.fixme(
  'lab/query: enum+min/max+pattern query param violations → 422 (Phase 2: generator does not emit those constraints on query params)',
  async ({ request }) => {
    // FIXME: the generator emits only z.string()/z.number() for query params,
    // no enum/min/max/pattern constraints. These 422s cannot fire yet.
    // Root cause: router.ts emitQueryValidation uses paramZodExpr which only
    // checks tsType (string/number) and required, ignoring schema constraints.
    expect((await labGet(request, 'query?tier=platinum&count=50&code=ABC')).status).toBe(422) // enum
    expect((await labGet(request, 'query?tier=gold&count=0&code=ABC')).status).toBe(422) // min:1
    expect((await labGet(request, 'query?tier=gold&count=999&code=ABC')).status).toBe(422) // max:100
    expect((await labGet(request, 'query?tier=gold&count=50&code=abcd')).status).toBe(422) // pattern
  },
)

// ===========================================================================
// I. HEADER PARAMS — presence legs only (Phase 1)
// Bad-value/pattern legs are Phase 2 (generator emits z.string() only, no pattern)
// ===========================================================================

test('lab/header: required header present → 200; missing header → 422', async ({ request }) => {
  // Valid token: header validation passes, endpoint returns 200
  const ok = await labGet(request, 'header', { 'X-Lab-Token': 'tok-1234' })
  expect(ok.status).toBe(LAB_OK)

  // Missing required header → 422
  const missing = await labGet(request, 'header')
  expect(missing.status).toBe(422)
})

test.fixme(
  'lab/header: pattern-violating header value → 422 (Phase 2: generator emits z.string() only, pattern ignored)',
  async ({ request }) => {
    // FIXME: the generator emits z.string() for header params — pattern ^tok-[0-9]{4}$ is not
    // enforced. Root cause: router.ts emitHeaderValidation uses a bare z.string() expression
    // regardless of the spec pattern constraint (shared.ts getHeaderParams only captures
    // rawName and required, not the schema).
    const bad = await labGet(request, 'header', { 'X-Lab-Token': 'garbage' })
    expect(bad.status).toBe(422)
  },
)

// ===========================================================================
// J. FORMATS — email/uuid/date/datetime PASS; time/duration/hostname via custom regex
// ===========================================================================

test('lab/formats: date, datetime, email, uuid round-trip and reject', async ({ request }) => {
  const valid = {
    day: '2026-01-15',
    moment: '2026-01-15T10:30:00Z',
    clock: '10:30:00',
    span: 'P1DT2H',
    mail: 'a@b.com',
    identifier: '550e8400-e29b-41d4-a716-446655440000',
    host: 'example.com',
  }
  const ok = await labPost(request, 'formats', valid)
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual(valid)

  expect((await labPost(request, 'formats', { ...valid, day: '15-01-2026' })).status).toBe(422)
  expect((await labPost(request, 'formats', { ...valid, moment: 'not-a-datetime' })).status).toBe(422)
  expect((await labPost(request, 'formats', { ...valid, clock: '99:99:99' })).status).toBe(422)
  expect((await labPost(request, 'formats', { ...valid, span: '2 hours' })).status).toBe(422)
  expect((await labPost(request, 'formats', { ...valid, mail: 'notanemail' })).status).toBe(422)
  expect((await labPost(request, 'formats', { ...valid, identifier: 'not-a-uuid' })).status).toBe(422)
  expect((await labPost(request, 'formats', { ...valid, host: 'not a host!' })).status).toBe(422)
})

// ===========================================================================
// K. BODY SHAPE GUARD
// ===========================================================================

test('K3: JSON array where an object is expected is a clean 422', async ({ request }) => {
  // A top-level JSON array is valid JSON but wrong shape for a $ref-based object body.
  // The Zod schema (LabNumericSchema) will reject it with a 422.
  const res = await request.post(`${LAB_BASE}/numeric`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: '[1,2,3]',
  })
  expect(res.status()).toBe(422)
})

// ===========================================================================
// L. INLINE BODY (Step 0 verification + Phase 2 fixme)
// ===========================================================================

test('lab/inline-body: valid inline body is accepted (no Zod wired — generator limitation)', async ({
  request,
}) => {
  // The inline body has no safeParse wired by the generator (getBodyInfo returns
  // typeName:undefined for inline schemas, so no schema name is derived and no
  // validation block is emitted). The handler accepts anything.
  const ok = await labPost(request, 'inline-body', { title: 'hello', rank: 3 })
  expect(ok.status).toBe(LAB_OK)
  expect(ok.body).toEqual({ title: 'hello', rank: 3 })
})

test.fixme(
  'lab/inline-body: constraint violations on inline body → 422 (Phase 2: no safeParse wired for inline schemas)',
  async ({ request }) => {
    // FIXME: the router emits `const body = await c.req.json()` with NO safeParse call for
    // inline (non-$ref) request bodies. getBodyInfo() in shared.ts returns { typeName: undefined }
    // for inline schemas, so no schema name is derived and no validation is emitted.
    // Root cause: packages/openapi-server/src/plugins/shared.ts getBodyInfo() line 227.
    expect((await labPost(request, 'inline-body', { title: 'x', rank: 3 })).status).toBe(422) // minLength:2
    expect((await labPost(request, 'inline-body', { title: 'hello', rank: 9 })).status).toBe(422) // max:5
    expect((await labPost(request, 'inline-body', { title: 'hello' })).status).toBe(422) // required rank
  },
)
