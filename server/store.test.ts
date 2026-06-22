import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Store } from './store.js'

test('legacy IP addresses migrate to the default port', async () => {
  const path = join(tmpdir(), `cluster-hub-${randomUUID()}.json`)
  await writeFile(path, JSON.stringify({
    user: null,
    computers: [{ id: 'legacy', name: 'Legacy PC', ipAddresses: ['192.168.1.10'], macAddress: '00:11:22:33:44:55', allowShutdown: false }],
  }))

  try {
    const data = await new Store(path).read()
    assert.deepEqual(data.computers[0].endpoints, [{ ipAddress: '192.168.1.10', port: 8732 }])
  } finally {
    await rm(path, { force: true })
  }
})
