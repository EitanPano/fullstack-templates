export type HealthView =
  { reachable: true; version: string; uptimeSeconds: number } | { reachable: false; reason: string }
