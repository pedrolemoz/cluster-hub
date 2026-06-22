import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt:${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split(':')
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = (await scrypt(password, salt, expected.length)) as Buffer
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function signSession(username: string, secret: string, maxAgeSeconds = 60 * 60 * 24 * 30) {
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + maxAgeSeconds * 1000 })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function readSession(token: string | undefined, secret: string) {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { username: string; expiresAt: number }
    return parsed.expiresAt > Date.now() ? parsed : null
  } catch { return null }
}

export function normalizeMac(value: string) {
  const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
  if (!/^[0-9A-F]{12}$/.test(compact)) return null
  return compact.match(/.{2}/g)!.join(':')
}

export function isAllowedHost(address: string) {
  if (isIP(address)) return true
  return /^(?=.{1,63}$)(?!-)[a-zA-Z0-9-]+(?<!-)$/.test(address)
}
