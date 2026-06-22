import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type NetworkEndpoint = { ipAddress: string; port: number }
export type Computer = { id: string; name: string; endpoints: NetworkEndpoint[]; macAddress: string; allowShutdown: boolean }
export type StoreData = { user: null | { username: string; passwordHash: string }; computers: Computer[] }
type LegacyComputer = Omit<Computer, 'endpoints'> & { ipAddresses: string[] }

const emptyStore: StoreData = { user: null, computers: [] }

export class Store {
  private queue = Promise.resolve()
  constructor(private readonly path: string) {}

  async read(): Promise<StoreData> {
    try {
      const stored = JSON.parse(await readFile(this.path, 'utf8')) as Omit<StoreData, 'computers'> & { computers: Array<Computer | LegacyComputer> }
      const computers = stored.computers.map(computer => ({
        id: computer.id,
        name: computer.name,
        endpoints: 'endpoints' in computer ? computer.endpoints : computer.ipAddresses.map((ipAddress: string) => ({ ipAddress, port: 8732 })),
        macAddress: computer.macAddress,
        allowShutdown: computer.allowShutdown,
      }))
      return { user: stored.user, computers }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(emptyStore)
      throw error
    }
  }

  update(mutator: (data: StoreData) => void | Promise<void>) {
    const operation = this.queue.then(async () => {
      const data = await this.read()
      await mutator(data)
      await mkdir(dirname(this.path), { recursive: true })
      const temporaryPath = `${this.path}.tmp`
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), { mode: 0o600 })
      await rename(temporaryPath, this.path)
      return data
    })
    this.queue = operation.then(() => undefined, () => undefined)
    return operation
  }
}
