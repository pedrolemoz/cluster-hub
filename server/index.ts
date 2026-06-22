import { randomBytes, randomUUID } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectComputer, requestShutdown, wake } from './network.js'
import { hashPassword, isAllowedHost, normalizeMac, readSession, signSession, verifyPassword } from './security.js'
import { Store } from './store.js'
import { PowerCooldown } from './cooldown.js'

const port = Number(process.env.PORT ?? 3000)
const dataFile = process.env.DATA_FILE ?? resolve('data', 'cluster-hub.json')
const sessionSecret = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex')
const secureCookies = process.env.NODE_ENV === 'production'
const store = new Store(dataFile)
const app = express()
const POWER_COOLDOWN_MS = 10_000
const powerCooldown = new PowerCooldown(POWER_COOLDOWN_MS)

if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is unset; sessions will be invalidated on restart.')
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '32kb' }))

const attempts = new Map<string, { count: number; resetAt: number }>()
function limitLogin(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? 'unknown'; const now = Date.now(); const current = attempts.get(key)
  if (!current || current.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 }); return next() }
  if (current.count >= 10) return res.status(429).json({ error: 'Too many attempts. Try again later.' })
  current.count += 1; next()
}

function claimPowerAction(computerId: string, res: Response) {
  const result = powerCooldown.claim(computerId)
  if (!result.accepted) {
    res.setHeader('Retry-After', result.retryAfterSeconds)
    res.status(429).json({ error: `Power action is cooling down. Try again in ${result.retryAfterSeconds}s.` })
    return false
  }
  return true
}

function cookies(req: Request) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').filter(Boolean).map(value => value.trim().split('=').map(decodeURIComponent)))
}
function setSession(res: Response, username: string) {
  res.cookie('cluster_session', signSession(username, sessionSecret), {
    httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000,
  })
}
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const data = await store.read(); const session = readSession(cookies(req).cluster_session, sessionSecret)
  if (!data.user || !session || session.username !== data.user.username) return res.status(401).json({ error: 'Authentication required.' })
  next()
}
const route = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next) }

app.get('/api/auth/status', route(async (req, res) => {
  const data = await store.read(); const session = readSession(cookies(req).cluster_session, sessionSecret)
  res.json({ needsSetup: !data.user, authenticated: Boolean(data.user && session?.username === data.user.username), username: session?.username })
}))
app.post('/api/auth/setup', route(async (req, res) => {
  const username = String(req.body.username ?? '').trim(); const password = String(req.body.password ?? '')
  if (username.length < 3 || username.length > 64) return res.status(400).json({ error: 'Username must be 3 to 64 characters.' })
  if (password.length < 10 || password.length > 256) return res.status(400).json({ error: 'Password must be at least 10 characters.' })
  await store.update(async data => {
    if (data.user) throw Object.assign(new Error('Setup is already complete.'), { status: 409 })
    data.user = { username, passwordHash: await hashPassword(password) }
  })
  setSession(res, username); res.status(201).json({ username })
}))
app.post('/api/auth/login', limitLogin, route(async (req, res) => {
  const data = await store.read(); const username = String(req.body.username ?? ''); const password = String(req.body.password ?? '')
  if (!data.user) return res.status(409).json({ error: 'Complete setup first.' })
  if (username !== data.user.username || !(await verifyPassword(password, data.user.passwordHash))) return res.status(401).json({ error: 'Invalid username or password.' })
  attempts.delete(req.ip ?? 'unknown'); setSession(res, username); res.json({ username })
}))
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('cluster_session', { path: '/' }); res.status(204).end() })

app.get('/api/computers', requireAuth, route(async (_req, res) => {
  const { computers } = await store.read()
  if (_req.query.probe === 'false') return res.json(computers.map(computer => ({ ...computer, detectedEndpoint: null, online: null })))
  const statuses = await Promise.all(computers.map(async computer => ({ ...computer, detectedEndpoint: await detectComputer(computer.endpoints), online: false })))
  res.json(statuses.map(item => ({ ...item, online: Boolean(item.detectedEndpoint) })))
}))
app.post('/api/computers', requireAuth, route(async (req, res) => {
  const name = String(req.body.name ?? '').trim()
  const submittedEndpoints: unknown[] = Array.isArray(req.body.endpoints) ? req.body.endpoints : []
  const endpoints = submittedEndpoints.map(value => {
    const endpoint = value as { ipAddress?: unknown; port?: unknown }
    return { ipAddress: String(endpoint.ipAddress ?? '').trim(), port: Number(endpoint.port) }
  })
  const macAddress = normalizeMac(String(req.body.macAddress ?? ''))
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a computer name up to 80 characters.' })
  if (!endpoints.length || endpoints.length > 10 || endpoints.some(endpoint => !isAllowedHost(endpoint.ipAddress))) return res.status(400).json({ error: 'Enter 1 to 10 valid IP addresses or local host aliases.' })
  if (endpoints.some(endpoint => !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535)) return res.status(400).json({ error: 'Every port must be a number from 1 to 65535.' })
  if (new Set(endpoints.map(endpoint => `${endpoint.ipAddress}:${endpoint.port}`)).size !== endpoints.length) return res.status(400).json({ error: 'Each IP address and port combination must be unique.' })
  if (!macAddress) return res.status(400).json({ error: 'Enter a valid MAC address.' })
  const computer = { id: randomUUID(), name, endpoints, macAddress, allowShutdown: Boolean(req.body.allowShutdown) }
  await store.update(data => { data.computers.push(computer) }); res.status(201).json({ ...computer, detectedEndpoint: null, online: null })
}))
app.put('/api/computers/:id', requireAuth, route(async (req, res) => {
  const name = String(req.body.name ?? '').trim()
  const submittedEndpoints: unknown[] = Array.isArray(req.body.endpoints) ? req.body.endpoints : []
  const endpoints = submittedEndpoints.map(value => {
    const endpoint = value as { ipAddress?: unknown; port?: unknown }
    return { ipAddress: String(endpoint.ipAddress ?? '').trim(), port: Number(endpoint.port) }
  })
  const macAddress = normalizeMac(String(req.body.macAddress ?? ''))
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a computer name up to 80 characters.' })
  if (!endpoints.length || endpoints.length > 10 || endpoints.some(endpoint => !isAllowedHost(endpoint.ipAddress))) return res.status(400).json({ error: 'Enter 1 to 10 valid IP addresses or local host aliases.' })
  if (endpoints.some(endpoint => !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535)) return res.status(400).json({ error: 'Every port must be a number from 1 to 65535.' })
  if (new Set(endpoints.map(endpoint => `${endpoint.ipAddress}:${endpoint.port}`)).size !== endpoints.length) return res.status(400).json({ error: 'Each IP address and port combination must be unique.' })
  if (!macAddress) return res.status(400).json({ error: 'Enter a valid MAC address.' })
  const computer = { id: String(req.params.id), name, endpoints, macAddress, allowShutdown: Boolean(req.body.allowShutdown) }
  let found = false
  await store.update(data => { const index = data.computers.findIndex(item => item.id === req.params.id); if (index >= 0) { data.computers[index] = computer; found = true } })
  if (!found) return res.status(404).json({ error: 'Computer not found.' })
  res.json({ ...computer, detectedEndpoint: null, online: null })
}))
app.delete('/api/computers/:id', requireAuth, route(async (req, res) => {
  let found = false
  await store.update(data => { const index = data.computers.findIndex(item => item.id === req.params.id); if (index >= 0) { data.computers.splice(index, 1); found = true } })
  if (found) { powerCooldown.clear(String(req.params.id)); res.status(204).end() } else res.status(404).json({ error: 'Computer not found.' })
}))
app.post('/api/computers/:id/wake', requireAuth, route(async (req, res) => {
  const computer = (await store.read()).computers.find(item => item.id === req.params.id)
  if (!computer) return res.status(404).json({ error: 'Computer not found.' })
  if (!claimPowerAction(computer.id, res)) return
  await wake(computer.macAddress); res.json({ status: 'wake_sent' })
}))
app.post('/api/computers/:id/shutdown', requireAuth, route(async (req, res) => {
  const computer = (await store.read()).computers.find(item => item.id === req.params.id)
  if (!computer) return res.status(404).json({ error: 'Computer not found.' })
  if (!computer.allowShutdown) return res.status(403).json({ error: 'Shutdown is disabled for this computer.' })
  if (!claimPowerAction(computer.id, res)) return
  const detectedEndpoint = await detectComputer(computer.endpoints)
  if (!detectedEndpoint) return res.status(409).json({ error: 'Computer is offline.' })
  await requestShutdown(detectedEndpoint); res.json({ status: 'shutting_down' })
}))

const dist = resolve('dist')
if (existsSync(dist)) { app.use(express.static(dist)); app.get('*splat', (_req, res) => res.sendFile(resolve(dist, 'index.html'))) }
app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error); res.status(error.status ?? 500).json({ error: error.status ? error.message : 'Something went wrong.' })
})
app.listen(port, '0.0.0.0', () => console.log(`ClusterHub listening on ${port}`))
