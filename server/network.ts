import dgram from 'node:dgram'
import { isIP } from 'node:net'
import type { NetworkEndpoint } from './store.js'

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

export async function wake(macAddress: string) {
  const mac = Buffer.from(macAddress.replaceAll(':', ''), 'hex')
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => mac)])
  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', error => { socket.close(); reject(error) })
    socket.bind(() => {
      socket.setBroadcast(true)
      socket.send(packet, 9, '255.255.255.255', error => { socket.close(); error ? reject(error) : resolve() })
    })
  })
}
