import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, isAllowedHost, normalizeMac, readSession, signSession, verifyPassword } from './security.js'

test('password hashes verify without storing the password', async () => {
  const hash = await hashPassword('a very secure password')
  assert.equal(hash.includes('a very secure password'), false)
  assert.equal(await verifyPassword('a very secure password', hash), true)
  assert.equal(await verifyPassword('wrong password', hash), false)
})

test('sessions reject tampering', () => {
  const token = signSession('pedro', 'test-secret')
  assert.equal(readSession(token, 'test-secret')?.username, 'pedro')
  assert.equal(readSession(`${token}x`, 'test-secret'), null)
  assert.equal(readSession(token, 'other-secret'), null)
})

test('MAC addresses are normalized and validated', () => {
  assert.equal(normalizeMac('00-11-22-aa-bb-cc'), '00:11:22:AA:BB:CC')
  assert.equal(normalizeMac('invalid'), null)
})

test('public, private, overlay, IPv6, and local alias hosts are accepted', () => {
  assert.equal(isAllowedHost('192.168.1.12'), true)
  assert.equal(isAllowedHost('10.0.0.1'), true)
  assert.equal(isAllowedHost('172.31.255.254'), true)
  assert.equal(isAllowedHost('100.98.149.98'), true)
  assert.equal(isAllowedHost('100.127.255.254'), true)
  assert.equal(isAllowedHost('8.8.8.8'), true)
  assert.equal(isAllowedHost('203.0.113.42'), true)
  assert.equal(isAllowedHost('w11-vm'), true)
  assert.equal(isAllowedHost('fd00::1'), true)
  assert.equal(isAllowedHost('2606:4700:4700::1111'), true)
})

test('invalid addresses and domain names remain blocked', () => {
  assert.equal(isAllowedHost('999.999.999.999'), false)
  assert.equal(isAllowedHost('example.com'), false)
  assert.equal(isAllowedHost('-invalid-alias'), false)
})
