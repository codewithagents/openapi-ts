import { randomUUID } from 'node:crypto'
import type { PetstoreService } from '../../generated/service.js'
import { HttpError } from '../../generated/router.js'
import type {
  Pet,
  LabDelimitedEcho,
  LabDeepFilterEcho,
} from '../../generated/models.js'

const pets = new Map<string, Pet>()

export const petService: PetstoreService = {
  async listPets(params) {
    const all = Array.from(pets.values())
    if (params?.species) {
      return all.filter((p) => p.species.toLowerCase() === params.species!.toLowerCase())
    }
    return all
  },
  async createPet(body) {
    const pet: Pet = { id: randomUUID(), ...body }
    pets.set(pet.id, pet)
    return pet
  },
  async getPet(id) {
    const pet = pets.get(id)
    if (!pet) throw new HttpError(404, `Pet ${id} not found`)
    return pet
  },
  async deletePet(id) {
    if (!pets.has(id)) throw new HttpError(404, `Pet ${id} not found`)
    pets.delete(id)
  },

  // -------------------------------------------------------------------------
  // Lab echo handlers — each echoes back validated input (identity functions)
  // -------------------------------------------------------------------------

  async labNumeric(body) {
    return body
  },

  async labString(body) {
    return body
  },

  async labArray(body) {
    return body
  },

  async labFormats(body) {
    return body
  },

  async labEnumConst(body) {
    return body
  },

  async labClosed(body) {
    return body
  },

  async labPresence(body) {
    // The Zod schema applies defaults; the router passes validatedBody (parsed data),
    // so defaults are already applied. Normalize to explicit nulls for optional absent fields.
    return {
      mandatory: body.mandatory,
      nullableField: body.nullableField ?? null,
      optionalField: body.optionalField ?? null,
      withDefault: body.withDefault ?? 'fallback',
    }
  },

  async labMap(body) {
    return body
  },

  async labEmptyMap() {
    return { label: 'empty', counts: {} }
  },

  async labUnion(body) {
    return body
  },

  async labAnyOfUnion(body) {
    return body
  },

  async labShape(body) {
    return body
  },

  async labInlineShape(body) {
    return body
  },

  async labInheritShape(body) {
    return body
  },

  async labResponseUnion(body) {
    // Echo the requested shape based on the `want` selector
    if (body.want === 'circle') {
      return { kind: 'circle', radius: 1.5 }
    }
    return { kind: 'square', side: 4 }
  },

  async labBackedEnum(body) {
    return body
  },

  async labTuple(body) {
    return body
  },

  async labAllOf(body) {
    return body
  },

  async labNestedVariant(body) {
    // Handler discipline: set readOnly serverId server-side, never echo writeOnly secret.
    // The body items are typed as LabVariantItem (read type from the interface), but the
    // router's Zod schema (LabNestedVariantSchema) validated the writable form (name + secret).
    // The raw JSON values are passed; we map each item to the read shape: keep name,
    // assign a new serverId, and drop the writeOnly secret field entirely.
    const items = (body.items as Array<{ name: string; secret?: string; serverId?: string }>).map(
      (item) => ({
        name: item.name,
        serverId: randomUUID(),
      }),
    )
    return { title: body.title, items }
  },

  async labInlineResponse() {
    // Inline response: return readOnly generated_at, omit writeOnly internal_token.
    return {
      label: 'inline',
      generated_at: '2026-06-13T12:00:00Z',
    }
  },

  async labLooseUnion(body) {
    return body
  },

  async labQuery(params) {
    return {
      tier: params.tier,
      count: params.count,
      code: params.code,
    }
  },

  async labHeader() {
    // The generator does not pass the header value to the service method.
    // Returning a placeholder; Phase 1 tests only check the 200/422 status,
    // not the echoed token value.
    return { token: '' }
  },

  async labInlineBody(body) {
    // Inline body: no Zod validation wired by the generator (inline schema, not a ref).
    return body
  },

  // -------------------------------------------------------------------------
  // Phase 2 echo handlers
  // -------------------------------------------------------------------------

  async labDelimitedQuery(params) {
    // The generator extracts csv/ssv/psv as bare strings via c.req.query().
    // The promised contract is arrays split by delimiter. We echo params as-is
    // to reveal the bug: the values are raw delimited strings, not arrays.
    return params as unknown as LabDelimitedEcho
  },

  async labDeepFilter(params) {
    // The generator uses c.req.query('filter') which cannot read deepObject params.
    // filter[gte]=10 is query key 'filter[gte]', not 'filter'. params.filter is undefined.
    // This handler will not be reached (the router 422s before calling it).
    return params as unknown as LabDeepFilterEcho
  },

  async labPath(score) {
    // score is a raw path param string (e.g. '15'). No range validation is wired.
    // The promised contract: { score: 15 } (number). Actual: string '15' cast to number.
    return { score: Number(score) }
  },

  async labFormBody(body) {
    // form-urlencoded body: the generator calls c.req.json() which will throw a
    // SyntaxError on URL-encoded data. This handler is not reached; Hono returns 500.
    return body
  },

  async labGallery(body) {
    // multipart/form-data: the generator calls c.req.json() which throws for multipart.
    // This handler is not reached; Hono returns 500.
    return body
  },

  async labAccepted(body) {
    // 202-only declared response. Generator defaults to 200 and Promise<void> return.
    // The router calls c.json(undefined) so the response is JSON null at status 200.
    void body
  },

  async labDualStatus() {
    // GET with 200+202 declared. Generator picks 200. There is no mechanism for the
    // service to signal 202; the router always calls c.json(await service.labDualStatus()).
    return { phase: 'done' }
  },

  async labPlainText() {
    // text/plain response. Generator derives Promise<void> (no json response type).
    // Router calls c.json(undefined) → JSON null, Content-Type: application/json.
    // The promised contract: Content-Type: text/plain, raw string body.
  },

  async labDownload() {
    // application/octet-stream response. Same as plain-text: generator uses c.json(undefined).
    // Promised: binary download with correct Content-Type. Actual: JSON null.
  },

  async labInt64(body) {
    // int64 echo: min leg (ledger >= 0) is validated. For large int64 values
    // (> Number.MAX_SAFE_INTEGER = 2^53 - 1), JavaScript JSON.parse loses precision.
    return body
  },
}

/** Reset all pets — only used in dev/test environments */
export function resetPets(): void {
  pets.clear()
}
