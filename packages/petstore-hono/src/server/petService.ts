import { randomUUID } from 'node:crypto'
import type { PetstoreService } from '../../generated/service.js'
import type { Pet } from '../../generated/models.js'

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
    if (!pet) throw new Error(`Pet ${id} not found`)
    return pet
  },
  async deletePet(id) {
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
}

/** Reset all pets — only used in dev/test environments */
export function resetPets(): void {
  pets.clear()
}
