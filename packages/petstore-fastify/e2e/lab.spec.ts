import { expect, test } from '@playwright/test'

// Real-socket coverage for the lab routes: query reshaping/coercion, validation
// boundaries, non-JSON content types, dual status, and response serialization.
// These exercise the generated Fastify router over an actual HTTP socket, which
// inject() cannot: real query-string parsing, header normalization, body parsers.

test.describe('query coercion (#314)', () => {
  test('numeric query params are coerced: GET /api/lab/query returns 200', async ({ request }) => {
    const res = await request.get('/api/lab/query', {
      params: { tier: 'gold', count: '42', code: 'ABC' },
    })
    expect(res.status()).toBe(200)
    // Response serialized through LabQueryEchoSchema: count is a number, not "42".
    expect(await res.json()).toEqual({ tier: 'gold', count: 42, code: 'ABC' })
  })

  test('non-numeric count is rejected by the validator: returns 400', async ({ request }) => {
    const res = await request.get('/api/lab/query', {
      params: { tier: 'gold', count: 'notanumber', code: 'ABC' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('FST_ERR_VALIDATION')
  })
})

test.describe('header validation (#313)', () => {
  test('mixed-case X-Lab-Token header validates: GET /api/lab/header returns 200', async ({
    request,
  }) => {
    const res = await request.get('/api/lab/header', { headers: { 'X-Lab-Token': 'tok-1234' } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ token: expect.any(String) })
  })

  test('missing X-Lab-Token header is rejected: returns 400', async ({ request }) => {
    const res = await request.get('/api/lab/header')
    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('FST_ERR_VALIDATION')
  })
})

test.describe('query reshaping (#322)', () => {
  test('deepObject filter[...] params are reshaped + coerced: GET /api/lab/deep-filter', async ({
    request,
  }) => {
    const res = await request.get('/api/lab/deep-filter', {
      params: { 'filter[gte]': '10', 'filter[color]': 'red' },
    })
    expect(res.status()).toBe(200)
    // gte arrived as "10" and was coerced to a number by the querystring schema.
    expect(await res.json()).toMatchObject({ gte: 10, color: 'red' })
  })

  test('delimited query params split by their delimiter: GET /api/lab/delimited-query', async ({
    request,
  }) => {
    const res = await request.get('/api/lab/delimited-query', {
      params: { csv: 'a,b,c', ssv: 'x y z', psv: 'p|q' },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({
      csv: ['a', 'b', 'c'],
      ssv: ['x', 'y', 'z'],
      psv: ['p', 'q'],
    })
  })
})

test.describe('non-JSON content types (#318)', () => {
  test('form-urlencoded body is parsed: POST /api/lab/form-body returns 200', async ({
    request,
  }) => {
    const res = await request.post('/api/lab/form-body', {
      form: { label: 'test', quantity: '5' },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('multipart body is parsed: POST /api/lab/gallery returns 200', async ({ request }) => {
    const res = await request.post('/api/lab/gallery', {
      multipart: { title: 'test-gallery' },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ uploaded: 1 })
  })

  test('GET /api/lab/plain-text returns a text/plain body', async ({ request }) => {
    const res = await request.get('/api/lab/plain-text')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/plain')
    expect(await res.text()).toBe('hello plain text')
  })

  test('GET /api/lab/download returns application/octet-stream bytes', async ({ request }) => {
    const res = await request.get('/api/lab/download')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/octet-stream')
    expect([...(await res.body())]).toEqual([1, 2, 3, 4])
  })
})

test.describe('status + unknown-shape responses', () => {
  test('dual-status returns 200 when prefer=immediate', async ({ request }) => {
    const res = await request.get('/api/lab/dual-status', { params: { prefer: 'immediate' } })
    expect(res.status()).toBe(200)
    expect((await res.json()).phase).toBe('done')
  })

  test('dual-status returns 202 when prefer=async', async ({ request }) => {
    const res = await request.get('/api/lab/dual-status', { params: { prefer: 'async' } })
    expect(res.status()).toBe(202)
    expect((await res.json()).phase).toBe('pending')
  })

  test('response-union echoes a concrete variant: POST /api/lab/response-union', async ({
    request,
  }) => {
    const res = await request.post('/api/lab/response-union', { data: { want: 'circle' } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ kind: 'circle', radius: 1 })
  })

  test('inline-response returns an unnamed-shape body: GET /api/lab/inline-response', async ({
    request,
  }) => {
    const res = await request.get('/api/lab/inline-response')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true, note: 'inline response' })
  })
})
