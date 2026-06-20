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
  async labNumeric(_body) {
    throw new Error('not implemented')
  },
  async labString(_body) {
    throw new Error('not implemented')
  },
  async labArray(_body) {
    throw new Error('not implemented')
  },
  async labFormats(_body) {
    throw new Error('not implemented')
  },
  async labEnumConst(_body) {
    throw new Error('not implemented')
  },
  async labClosed(_body) {
    throw new Error('not implemented')
  },
  async labPresence(_body) {
    throw new Error('not implemented')
  },
  async labMap(_body) {
    throw new Error('not implemented')
  },
  async labEmptyMap() {
    throw new Error('not implemented')
  },
  async labUnion(_body) {
    throw new Error('not implemented')
  },
  async labAnyOfUnion(_body) {
    throw new Error('not implemented')
  },
  async labShape(_body) {
    throw new Error('not implemented')
  },
  async labInlineShape(_body) {
    throw new Error('not implemented')
  },
  async labInheritShape(_body) {
    throw new Error('not implemented')
  },
  async labResponseUnion(body) {
    // Echo: pick a concrete variant based on the requested selector.
    return body.want === 'circle' ? { kind: 'circle', radius: 1 } : { kind: 'square', side: 1 }
  },
  async labBackedEnum(_body) {
    throw new Error('not implemented')
  },
  async labTuple(_body) {
    throw new Error('not implemented')
  },
  async labAllOf(_body) {
    throw new Error('not implemented')
  },
  async labNestedVariant(_body) {
    throw new Error('not implemented')
  },
  async labInlineResponse() {
    // Echo: a fixed inline-shaped response (no named schema).
    return { ok: true, note: 'inline response' }
  },
  async labLooseUnion(_body) {
    throw new Error('not implemented')
  },
  async labQuery(_params) {
    throw new Error('not implemented')
  },
  async labHeader() {
    throw new Error('not implemented')
  },
  async labInlineBody(_body) {
    throw new Error('not implemented')
  },
  async labDelimitedQuery(params) {
    // Echo the delimiter-split arrays back; the router already reshaped them.
    return { csv: params.csv, ssv: params.ssv, psv: params.psv }
  },
  async labDeepFilter(params) {
    // Echo the reshaped + coerced deepObject filter back.
    return {
      gte: params.filter.gte ?? 0,
      lte: params.filter.lte ?? 0,
      color: params.filter.color,
    }
  },
  async labPath(_score) {
    throw new Error('not implemented')
  },
  async labFormBody(_body) {
    throw new Error('not implemented')
  },
  async labGallery(_body) {
    throw new Error('not implemented')
  },
  async labAccepted(_body) {
    throw new Error('not implemented')
  },
  async labDualStatus(_params) {
    throw new Error('not implemented')
  },
  async labPlainText() {
    throw new Error('not implemented')
  },
  async labDownload() {
    throw new Error('not implemented')
  },
  async labInt64(_body) {
    throw new Error('not implemented')
  },
}

/** Reset all pets. Only used in dev/test environments. */
export function resetPets(): void {
  pets.clear()
}
