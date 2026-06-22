import assert from 'node:assert/strict'
import test from 'node:test'
import { endpointUrl } from './network.js'

test('endpoint URLs include the configured port', () => {
  assert.equal(endpointUrl({ ipAddress: '192.168.1.42', port: 8732 }, '/health'), 'http://192.168.1.42:8732/health')
  assert.equal(endpointUrl({ ipAddress: '10.0.0.8', port: 9123 }, '/shutdown'), 'http://10.0.0.8:9123/shutdown')
})

test('host aliases are used as endpoint hosts', () => {
  assert.equal(endpointUrl({ ipAddress: 'w11-vm', port: 8732 }, '/health'), 'http://w11-vm:8732/health')
})

test('IPv6 endpoint URLs wrap the address before the port', () => {
  assert.equal(endpointUrl({ ipAddress: 'fd00::42', port: 8732 }, '/health'), 'http://[fd00::42]:8732/health')
})
