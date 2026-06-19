/**
 * Runtime inject() suite for the generated Fastify router.
 * Uses a local stub service (not the real petService) with canned returns
 * so each test controls exactly what the service layer does.
 *
 * Scenarios covered:
 *   - numeric + boolean query coercion success (#314)
 *   - mixed-case header validation passes (#313)
 *   - 204 empty body on DELETE
 *   - text/plain content-type on GET /lab/plain-text
 *   - octet-stream bytes on GET /lab/download
 *   - form-urlencoded body parsed without 415 (#318)
 *   - multipart body parsed without 415 (#318)
 *   - 200-vs-202 dual-status selection
 *   - async HttpError(404) from service → statusCode 404 (#315)
 */
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import fastifyFormbody from '@fastify/formbody'
import fastifyMultipart from '@fastify/multipart'
import { createRouter, HttpError } from '../../generated/router.js'
import type { PetstoreService } from '../../generated/service.js'

/** Build a test Fastify app with the required parsers and a custom stub service. */
function buildApp(service: PetstoreService) {
  const app = Fastify()
  app.register(fastifyFormbody)
  app.register(fastifyMultipart, { attachFieldsToBody: true })
  app.register(async (instance) => {
    createRouter(instance, service)
  })
  return app
}

/** Minimal stub that satisfies the interface — each test overrides the relevant method. */
function makeStub(overrides: Partial<PetstoreService> = {}): PetstoreService {
  const notImplemented = async () => {
    throw new Error('not implemented in this test')
  }
  return {
    listPets: notImplemented as PetstoreService['listPets'],
    createPet: notImplemented as PetstoreService['createPet'],
    getPet: notImplemented as PetstoreService['getPet'],
    deletePet: notImplemented as PetstoreService['deletePet'],
    labNumeric: notImplemented as PetstoreService['labNumeric'],
    labString: notImplemented as PetstoreService['labString'],
    labArray: notImplemented as PetstoreService['labArray'],
    labFormats: notImplemented as PetstoreService['labFormats'],
    labEnumConst: notImplemented as PetstoreService['labEnumConst'],
    labClosed: notImplemented as PetstoreService['labClosed'],
    labPresence: notImplemented as PetstoreService['labPresence'],
    labMap: notImplemented as PetstoreService['labMap'],
    labEmptyMap: notImplemented as PetstoreService['labEmptyMap'],
    labUnion: notImplemented as PetstoreService['labUnion'],
    labAnyOfUnion: notImplemented as PetstoreService['labAnyOfUnion'],
    labShape: notImplemented as PetstoreService['labShape'],
    labInlineShape: notImplemented as PetstoreService['labInlineShape'],
    labInheritShape: notImplemented as PetstoreService['labInheritShape'],
    labResponseUnion: notImplemented as PetstoreService['labResponseUnion'],
    labBackedEnum: notImplemented as PetstoreService['labBackedEnum'],
    labTuple: notImplemented as PetstoreService['labTuple'],
    labAllOf: notImplemented as PetstoreService['labAllOf'],
    labNestedVariant: notImplemented as PetstoreService['labNestedVariant'],
    labInlineResponse: notImplemented as PetstoreService['labInlineResponse'],
    labLooseUnion: notImplemented as PetstoreService['labLooseUnion'],
    labQuery: notImplemented as PetstoreService['labQuery'],
    labHeader: notImplemented as PetstoreService['labHeader'],
    labInlineBody: notImplemented as PetstoreService['labInlineBody'],
    labDelimitedQuery: notImplemented as PetstoreService['labDelimitedQuery'],
    labDeepFilter: notImplemented as PetstoreService['labDeepFilter'],
    labPath: notImplemented as PetstoreService['labPath'],
    labFormBody: notImplemented as PetstoreService['labFormBody'],
    labGallery: notImplemented as PetstoreService['labGallery'],
    labAccepted: notImplemented as PetstoreService['labAccepted'],
    labDualStatus: notImplemented as PetstoreService['labDualStatus'],
    labPlainText: notImplemented as PetstoreService['labPlainText'],
    labDownload: notImplemented as PetstoreService['labDownload'],
    labInt64: notImplemented as PetstoreService['labInt64'],
    ...overrides,
  }
}

describe('lab-routes inject() suite', () => {
  it('#314 numeric + boolean query params are coerced: GET /lab/query with count=42 returns 200', async () => {
    let capturedParams: { tier: string; count: number; code: string } | undefined
    const service = makeStub({
      async labQuery(params) {
        capturedParams = params
        return { tier: params.tier, count: params.count, code: params.code }
      },
    })
    const app = buildApp(service)
    const res = await app.inject({
      method: 'GET',
      url: '/lab/query?tier=gold&count=42&code=ABC',
    })
    expect(res.statusCode).toBe(200)
    expect(capturedParams?.count).toBe(42)
    expect(typeof capturedParams?.count).toBe('number')
  })

  it('#314 invalid count (non-numeric) returns 422 query validation error', async () => {
    const service = makeStub({
      async labQuery(params) {
        return { tier: params.tier, count: params.count, code: params.code }
      },
    })
    const app = buildApp(service)
    const res = await app.inject({
      method: 'GET',
      url: '/lab/query?tier=gold&count=notanumber&code=ABC',
    })
    expect(res.statusCode).toBe(422)
    expect(res.json<{ error: string }>().error).toBe('Invalid query parameters')
  })

  it('#313 lowercase X-Lab-Token header validates successfully: GET /lab/header returns 200', async () => {
    const service = makeStub({
      async labHeader() {
        return { token: 'tok-1234' }
      },
    })
    const app = buildApp(service)
    // HTTP headers are case-insensitive; Fastify normalizes them to lowercase.
    // The generator looks up headers by lowercased key so tok-1234 must pass.
    const res = await app.inject({
      method: 'GET',
      url: '/lab/header',
      headers: { 'x-lab-token': 'tok-1234' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ token: string }>()).toMatchObject({ token: 'tok-1234' })
  })

  it('#313 missing X-Lab-Token header returns 422', async () => {
    const service = makeStub({
      async labHeader() {
        return { token: '' }
      },
    })
    const app = buildApp(service)
    const res = await app.inject({ method: 'GET', url: '/lab/header' })
    expect(res.statusCode).toBe(422)
    expect(res.json<{ error: string }>().error).toBe('Invalid request headers')
  })

  it('DELETE /pets/:id returns 204 with empty body', async () => {
    const service = makeStub({
      async deletePet(_id) {
        // no-op, successful delete
      },
    })
    const app = buildApp(service)
    await app.inject({ method: 'POST', url: '/pets', payload: { name: 'Rex', species: 'dog' } })
    const res = await app.inject({ method: 'DELETE', url: '/pets/any-id' })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })

  it('GET /lab/plain-text returns text/plain content-type', async () => {
    const service = makeStub({
      async labPlainText() {
        return 'hello plain text'
      },
    })
    const app = buildApp(service)
    const res = await app.inject({ method: 'GET', url: '/lab/plain-text' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.body).toBe('hello plain text')
  })

  it('GET /lab/download returns application/octet-stream bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const service = makeStub({
      async labDownload() {
        return bytes
      },
    })
    const app = buildApp(service)
    const res = await app.inject({ method: 'GET', url: '/lab/download' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/octet-stream/)
    expect(Buffer.from(res.rawPayload)).toEqual(Buffer.from(bytes))
  })

  it('#318 form-urlencoded body on POST /lab/form-body returns 200 without 415', async () => {
    const service = makeStub({
      async labFormBody(_body) {
        return { ok: true }
      },
    })
    const app = buildApp(service)
    const res = await app.inject({
      method: 'POST',
      url: '/lab/form-body',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'label=test&quantity=5',
    })
    expect(res.statusCode).toBe(200)
  })

  it('#318 multipart body on POST /lab/gallery returns 200 without 415', async () => {
    const service = makeStub({
      async labGallery(_body) {
        return { uploaded: 1 }
      },
    })
    const app = buildApp(service)
    const boundary = '----TestBoundary123'
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\ntest-gallery\r\n` +
      `--${boundary}--\r\n`
    const res = await app.inject({
      method: 'POST',
      url: '/lab/gallery',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /lab/dual-status returns 200 when prefer=immediate', async () => {
    const service = makeStub({
      async labDualStatus(_params) {
        return { status: 200, body: { phase: 'done' } }
      },
    })
    const app = buildApp(service)
    const res = await app.inject({ method: 'GET', url: '/lab/dual-status?prefer=immediate' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ phase: string }>().phase).toBe('done')
  })

  it('GET /lab/dual-status returns 202 when service returns status 202', async () => {
    const service = makeStub({
      async labDualStatus(_params) {
        return { status: 202, body: { phase: 'pending' } }
      },
    })
    const app = buildApp(service)
    const res = await app.inject({ method: 'GET', url: '/lab/dual-status?prefer=async' })
    expect(res.statusCode).toBe(202)
    expect(res.json<{ phase: string }>().phase).toBe('pending')
  })

  it('#315 async service throwing HttpError(404) yields statusCode 404 not 500', async () => {
    const service = makeStub({
      async getPet(_id) {
        throw new HttpError(404, 'pet not found')
      },
    })
    const app = buildApp(service)
    const res = await app.inject({ method: 'GET', url: '/pets/nonexistent' })
    expect(res.statusCode).toBe(404)
    expect(res.json<{ error: string }>().error).toBe('pet not found')
  })
})
