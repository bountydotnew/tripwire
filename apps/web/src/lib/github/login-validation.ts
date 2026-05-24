/**
 * GitHub username rules used before calling public REST (exact-login lookup).
 */
export function isValidGithubLogin(login: string): boolean {
  if (login.length < 1 || login.length > 39) return false
  return /^[a-zA-Z0-9]$|^[a-zA-Z0-9][a-zA-Z0-9-]{0,37}[a-zA-Z0-9]$/.test(login)
}
