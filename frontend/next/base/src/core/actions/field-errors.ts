import 'server-only'

import { returnValidationErrors } from 'next-safe-action'

// Puts errors on an action's fields (the shape the form adapter places on its inputs). It sits
// beside safe-action.ts, the other file that names the action library, and imports nothing else
// so the data layer can use it without a cycle.
export const returnFieldErrors = returnValidationErrors
