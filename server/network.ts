import dgram from 'node:dgram'
import { isIP } from 'node:net'
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import type { NetworkEndpoint } from './store.js'

const defaultWakePorts = [9, 7]
const defaultWakeBroadcast = '255.255.255.255'

export function endpointUrl(endpoint: NetworkEndpoint, path: '/health' | '/shutdown') {
  const host = isIP(endpoint.ipAddress) === 6 ? `[${endpoint.ipAddress}]` : endpoint.ipAddress
  return `http://${host}:${endpoint.port}${path}`
}

export async function detectComputer(endpoints: NetworkEndpoint[], timeoutMs = 1800) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const probes = endpoints.map(async endpoint => {
      const response = await fetch(endpointUrl(endpoint, '/health'), { signal: controller.signal, headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error('Unhealthy')
      const body = await response.json() as { status?: string }
      if (body.status !== 'ok') throw new Error('Unexpected health response')
      return endpoint
    })
    return await Promise.any(probes)
  } catch { return null }
  finally { clearTimeout(timer) }
}

export async function requestShutdown(endpoint: NetworkEndpoint, timeoutMs = 3500) {
  const response = await fetch(endpointUrl(endpoint, '/shutdown'), {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Target returned ${response.status}`)
  const body = await response.json() as { status?: string }
  if (body.status !== 'shutting_down') throw new Error('Unexpected shutdown response')
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

export function wakePorts(value = process.env.WOL_PORTS) {
  if (!value) return defaultWakePorts
  const ports = value.split(',').map(item => Number(item.trim())).filter(port => Number.isInteger(port) && port >= 1 && port <= 65535)
  return ports.length ? unique(ports) : defaultWakePorts
}

function inferredIpv4Broadcast(address: string) {
  if (isIP(address) !== 4) return null
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
  return `${octets[0]}.${octets[1]}.${octets[2]}.255`
}

function ipv4ToNumber(address: string) {
  return address.split('.').reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0
}

function numberToIpv4(value: number) {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.')
}

function includeLocalInterfaceBroadcasts() {
  return process.env.CLUSTER_HUB_DOCKER_NETWORK !== 'bridge'
}

export function localIpv4Broadcasts(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()) {
  return unique(Object.values(interfaces).flatMap(entries => entries ?? []).map(entry => {
    if (entry.family !== 'IPv4' || entry.internal || !entry.netmask) return null
    return numberToIpv4((ipv4ToNumber(entry.address) | (~ipv4ToNumber(entry.netmask) >>> 0)) >>> 0)
  }).filter((address): address is string => Boolean(address)))
}

export function wakeAddresses(endpoints: NetworkEndpoint[], value = process.env.WOL_BROADCASTS, interfaces = networkInterfaces()) {
  const configured = value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
  const inferred = endpoints.map(endpoint => inferredIpv4Broadcast(endpoint.ipAddress)).filter((address): address is string => Boolean(address))
  const endpointIps = endpoints.map(endpoint => endpoint.ipAddress).filter(address => isIP(address) === 4)
  const localBroadcasts = includeLocalInterfaceBroadcasts() ? localIpv4Broadcasts(interfaces) : []
  return unique([...configured, defaultWakeBroadcast, ...inferred, ...localBroadcasts, ...endpointIps])
}

export function wakeBroadcasts(endpoints: NetworkEndpoint[], value = process.env.WOL_BROADCASTS, interfaces = networkInterfaces()) {
  return wakeAddresses(endpoints, value, interfaces)
}

export function wakeTargets(endpoints: NetworkEndpoint[] = []) {
  return wakeAddresses(endpoints).flatMap(address => wakePorts().map(port => ({ address, port })))
}

export function wakeMagicPacket(macAddress: string) {
  const mac = Buffer.from(macAddress.replaceAll(':', ''), 'hex')
  if (mac.length !== 6) throw new Error('Invalid MAC address')
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => mac)])
}

export async function wake(macAddress: string, endpoints: NetworkEndpoint[] = []) {
  const packet = wakeMagicPacket(macAddress)
  const targets = wakeTargets(endpoints)
  if (process.env.CLUSTER_HUB_DOCKER_NETWORK === 'bridge') console.warn('Wake-on-LAN is running in Docker bridge mode; UDP broadcasts may not reach the physical LAN. Use compose.host.yaml with Docker host networking for reliable WOL.')
  console.info(`Wake-on-LAN sending magic packet for ${macAddress} to UDP targets ${targets.map(target => `${target.address}:${target.port}`).join(', ')}`)
  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const errors: Error[] = []
    let sent = 0
    let pending = targets.length
    function finish(error?: Error | null) {
      if (error) errors.push(error)
      pending -= 1
      if (pending > 0) return
      socket.close()
      sent > 0 ? resolve() : reject(new AggregateError(errors, 'Wake-on-LAN packet could not be sent.'))
    }
    socket.once('error', error => { socket.close(); reject(error) })
    socket.bind(() => {
      socket.setBroadcast(true)
      for (const target of targets) socket.send(packet, target.port, target.address, error => {
        if (!error) sent += 1
        finish(error)
      })
    })
  })
}
