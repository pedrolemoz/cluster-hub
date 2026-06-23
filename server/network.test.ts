import assert from 'node:assert/strict'
import test from 'node:test'
import { endpointUrl, wakeBroadcasts, wakePorts } from './network.js'

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

test('wake broadcasts include global and inferred IPv4 /24 broadcast targets', () => {
  assert.deepEqual(wakeBroadcasts([
    { ipAddress: '192.168.1.42', port: 8732 },
    { ipAddress: '10.0.4.12', port: 8732 },
    { ipAddress: 'w11-vm', port: 8732 },
    { ipAddress: 'fd00::42', port: 8732 },
  ], ''), ['255.255.255.255', '192.168.1.255', '10.0.4.255'])
})

test('wake broadcasts include configured addresses first and deduplicate', () => {
  assert.deepEqual(wakeBroadcasts([{ ipAddress: '192.168.1.42', port: 8732 }], '192.168.1.255,10.0.0.255,192.168.1.255'), [
    '192.168.1.255',
    '10.0.0.255',
    '255.255.255.255',
  ])
})

test('wake ports default to common WOL ports and accept configured ports', () => {
  assert.deepEqual(wakePorts(''), [9, 7])
  assert.deepEqual(wakePorts('9, 40000, 7, 9, nope, 70000'), [9, 40000, 7])
})
