import assert from 'node:assert/strict'
import test from 'node:test'
import { PowerCooldown } from './cooldown.js'

test('power actions are blocked until the cooldown expires', () => {
  const cooldown = new PowerCooldown(10_000)
  assert.deepEqual(cooldown.claim('computer-1', 1_000), { accepted: true })
  assert.deepEqual(cooldown.claim('computer-1', 1_001), { accepted: false, retryAfterSeconds: 10 })
  assert.deepEqual(cooldown.claim('computer-1', 6_001), { accepted: false, retryAfterSeconds: 5 })
  assert.deepEqual(cooldown.claim('computer-1', 11_000), { accepted: true })
})

test('cooldowns are isolated per computer', () => {
  const cooldown = new PowerCooldown(10_000)
  assert.equal(cooldown.claim('computer-1', 1_000).accepted, true)
  assert.equal(cooldown.claim('computer-2', 1_001).accepted, true)
})
