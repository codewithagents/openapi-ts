// Module-level bearer token holder: set on login, read by every authed request via the
// generated client's `token` getter. Kept in its own module so main.tsx (which renders
// App) and App.tsx (which sets the token) do not import each other.
let token = ''

export function setToken(value: string): void {
  token = value
}

export function getToken(): string {
  return token
}
