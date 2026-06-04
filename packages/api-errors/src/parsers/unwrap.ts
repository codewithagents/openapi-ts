import { isObject } from './utils.js'

/** Unwrap `{ status: number, body: unknown }` (ApiError from generated client). */
function unwrapApiError(value: unknown): unknown {
  if (
    isObject(value) &&
    typeof (value as Record<string, unknown>)['status'] === 'number' &&
    Object.prototype.hasOwnProperty.call(value, 'body')
  ) {
    return (value as Record<string, unknown>)['body']
  }
  return value
}

/** Unwrap `{ response: { data: ... } }` (Axios-style errors). */
function unwrapAxiosResponse(value: unknown): unknown {
  if (isObject(value) && isObject(value['response']) && value['response']['data'] !== undefined) {
    return value['response']['data']
  }
  return value
}

/** Unwrap `{ data: { ... } }` top-level data envelopes (no field/errors at root). */
function unwrapDataEnvelope(value: unknown): unknown {
  if (isObject(value) && isObject(value['data']) && !('field' in value) && !('errors' in value)) {
    return value['data']
  }
  return value
}

/** Run all three unwrap steps in sequence to get the raw error body. */
export function unwrapBody(error: unknown): unknown {
  return unwrapDataEnvelope(unwrapAxiosResponse(unwrapApiError(error)))
}
