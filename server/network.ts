import dgram from 'node:dgram'
import { isIP } from 'node:net'
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

export function wakeBroadcasts(endpoints: NetworkEndpoint[], value = process.env.WOL_BROADCASTS) {
  const configured = value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
  const inferred = endpoints.map(endpoint => inferredIpv4Broadcast(endpoint.ipAddress)).filter((address): address is string => Boolean(address))
  return unique([...configured, defaultWakeBroadcast, ...inferred])
}

export async function wake(macAddress: string, endpoints: NetworkEndpoint[] = []) {
  const mac = Buffer.from(macAddress.replaceAll(':', ''), 'hex')
  if (mac.length !== 6) throw new Error('Invalid MAC address')
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => mac)])
  const targets = wakeBroadcasts(endpoints).flatMap(address => wakePorts().map(port => ({ address, port })))
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
