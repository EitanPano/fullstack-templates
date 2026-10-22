'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/shared/lib/action'

import { getHealth } from './health'

// A server action: validate, call the API through a loader or the client, revalidate what
// changed, return an ActionResult. The page passes it to a client component.
export async function refreshHealth(): Promise<ActionResult> {
  const health = await getHealth()
  if (!health.reachable) return { ok: false, error: `API unreachable (${health.reason})` }
  revalidatePath('/')
  return { ok: true, data: undefined }
}
