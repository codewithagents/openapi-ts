import { expect, test } from '@playwright/test'

// Real-socket CRUD against the generated Fastify router + real petService.
// Tests are self-isolating: each creates its own pet and references it by id,
// so they do not depend on a clean store or a bulk-reset route.

test('POST /api/pets creates a pet and returns it with a generated id', async ({ request }) => {
  const res = await request.post('/api/pets', { data: { name: 'Buddy', species: 'dog' } })
  expect(res.status()).toBe(201)
  const pet = await res.json()
  expect(pet).toMatchObject({ name: 'Buddy', species: 'dog' })
  expect(typeof pet.id).toBe('string')
  expect(pet.id.length).toBeGreaterThan(0)
})

test('POST /api/pets with an invalid body returns 400 from the validator', async ({ request }) => {
  // name is required by CreatePetRequestSchema; omitting it fails validatorCompiler.
  const res = await request.post('/api/pets', { data: { species: 'dog' } })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.code).toBe('FST_ERR_VALIDATION')
})

test('GET /api/pets/:id returns a previously created pet', async ({ request }) => {
  const created = await (
    await request.post('/api/pets', { data: { name: 'Rex', species: 'cat' } })
  ).json()
  const res = await request.get(`/api/pets/${created.id}`)
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ id: created.id, name: 'Rex', species: 'cat' })
})

test('GET /api/pets/:id for a missing pet returns 404 via HttpError', async ({ request }) => {
  const res = await request.get('/api/pets/does-not-exist')
  expect(res.status()).toBe(404)
  expect((await res.json()).error).toContain('not found')
})

test('GET /api/pets?species=... filters the list', async ({ request }) => {
  const species = 'e2e-filter-species'
  await request.post('/api/pets', { data: { name: 'A', species } })
  await request.post('/api/pets', { data: { name: 'B', species } })
  const res = await request.get(`/api/pets?species=${species}`)
  expect(res.status()).toBe(200)
  const pets = await res.json()
  expect(Array.isArray(pets)).toBe(true)
  expect(pets.length).toBeGreaterThanOrEqual(2)
  expect(pets.every((p: { species: string }) => p.species === species)).toBe(true)
})

test('DELETE /api/pets/:id returns 204 and the pet is gone', async ({ request }) => {
  const created = await (
    await request.post('/api/pets', { data: { name: 'Temp', species: 'fish' } })
  ).json()
  const del = await request.delete(`/api/pets/${created.id}`)
  expect(del.status()).toBe(204)
  expect(await del.text()).toBe('')

  const after = await request.get(`/api/pets/${created.id}`)
  expect(after.status()).toBe(404)
})
