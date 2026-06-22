export class PowerCooldown {
  private readonly blockedUntil = new Map<string, number>()

  constructor(private readonly durationMs: number) {}

  claim(key: string, now = Date.now()) {
    const deadline = this.blockedUntil.get(key) ?? 0
    if (deadline > now) return { accepted: false as const, retryAfterSeconds: Math.ceil((deadline - now) / 1000) }
    this.blockedUntil.set(key, now + this.durationMs)
    return { accepted: true as const }
  }

  clear(key: string) { this.blockedUntil.delete(key) }
}
