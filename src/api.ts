export type AuthStatus = { needsSetup: boolean; authenticated: boolean; username?: string }
export type NetworkEndpoint = { ipAddress: string; port: number }
export type Computer = { id: string; name: string; endpoints: NetworkEndpoint[]; macAddress: string; allowShutdown: boolean; online: boolean | null; detectedEndpoint: NetworkEndpoint | null }
export type ComputerInput = Pick<Computer, 'name' | 'endpoints' | 'macAddress' | 'allowShutdown'>

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...options?.headers } })
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? 'Request failed.') }
  return response.status === 204 ? undefined as T : response.json()
}
export const api = {
  authStatus: () => request<AuthStatus>('/api/auth/status'),
  setup: (username: string, password: string) => request('/api/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  computers: (probe = true) => request<Computer[]>(`/api/computers${probe ? '' : '?probe=false'}`),
  addComputer: (computer: ComputerInput) => request<Computer>('/api/computers', { method: 'POST', body: JSON.stringify(computer) }),
  updateComputer: (id: string, computer: ComputerInput) => request<Computer>(`/api/computers/${id}`, { method: 'PUT', body: JSON.stringify(computer) }),
  removeComputer: (id: string) => request(`/api/computers/${id}`, { method: 'DELETE' }),
  wake: (id: string) => request(`/api/computers/${id}/wake`, { method: 'POST' }),
  shutdown: (id: string) => request(`/api/computers/${id}/shutdown`, { method: 'POST' }),
}
