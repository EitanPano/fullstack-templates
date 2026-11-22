// admin-gate.ts belongs: the one gate of the admin namespace (/api/admin), applied by
// api/admin/routes.ts before any admin module. This template has no accounts, so as shipped it
// refuses every request, the same in every environment, until the product writes its own: for
// example the verification of the Cloudflare Access token (AGENTS.md > Migrating Pages Functions,
// step 6), which admits a caller and throws an `AppError` for anyone else.
// It does not belong: a module's own checks (its routes.ts chain) or the host rule (frontend-host.ts).
import { AppError } from '../services/utils/error'
import type { Gate } from './handler'

export const adminGate: Gate = () => {
  throw new AppError('forbidden', 'the admin API has no gate yet')
}
