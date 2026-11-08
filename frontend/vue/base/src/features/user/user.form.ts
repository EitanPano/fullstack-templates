import '@/shared/validators/zod-config'
import * as z from 'zod'

import { zUpdateMeBody } from '@/services/generated/zod.gen'
import { useZodForm } from '@/shared/validators/zod-form'

// The profile form. The one field the contract lets an account change is its phone number
// (`UpdateMeBody.phone`, E.164 or null); the rule is the generated schema's, never copied here.
// An empty control means "remove the number" (the store sends null), which the schema's string
// cannot say, so the schema is widened to accept '' and nothing else.
const profileSchema = z.object({ phone: zUpdateMeBody.shape.phone.or(z.literal('')) })

export function profileForm(initial = '') {
  return useZodForm(profileSchema, { phone: initial })
}
