import assert from 'node:assert/strict'
import test from 'node:test'
import { endpointUrl, localIpv4Broadcasts, wakeBroadcasts, wakeMagicPacket, wakePorts } from './network.js'

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
  ], '', {}), ['255.255.255.255', '192.168.1.255', '10.0.4.255', '192.168.1.42', '10.0.4.12'])
})

test('wake broadcasts include configured addresses first and deduplicate', () => {
  assert.deepEqual(wakeBroadcasts([{ ipAddress: '192.168.1.42', port: 8732 }], '192.168.1.255,10.0.0.255,192.168.1.255', {}), [
    '192.168.1.255',
    '10.0.0.255',
    '255.255.255.255',
    '192.168.1.42',
  ])
})

test('wake ports default to common WOL ports and accept configured ports', () => {
  assert.deepEqual(wakePorts(''), [9, 7])
  assert.deepEqual(wakePorts('9, 40000, 7, 9, nope, 70000'), [9, 40000, 7])
})

test('local IPv4 broadcasts are derived from interface netmasks', () => {
  assert.deepEqual(localIpv4Broadcasts({
    eth0: [{ address: '192.168.2.10', netmask: '255.255.255.0', family: 'IPv4', mac: '00:11:22:33:44:55', internal: false, cidr: '192.168.2.10/24' }],
    vpn0: [{ address: '10.8.1.10', netmask: '255.255.0.0', family: 'IPv4', mac: '00:11:22:33:44:66', internal: false, cidr: '10.8.1.10/16' }],
    loopback: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }],
  }), ['192.168.2.255', '10.8.255.255'])
})

test('wake magic packet contains the target MAC address repeated 16 times', () => {
  const packet = wakeMagicPacket('00:11:22:33:44:55')
  assert.equal(packet.length, 102)
  assert.equal(packet.subarray(0, 6).toString('hex'), 'ffffffffffff')
  assert.equal(packet.subarray(6).toString('hex'), '001122334455'.repeat(16))
})
