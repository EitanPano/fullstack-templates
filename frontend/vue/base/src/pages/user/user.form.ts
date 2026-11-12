import '@/shared/utils/validation'
import { zUpdateMeBody } from '@/services/generated/zod.gen'
import { either, field, literal, object } from '@/shared/utils/validation'
import { useSchemaForm } from '@/shared/validators/schema-form'

// The profile form. The one field the contract lets an account change is its phone number
// (`UpdateMeBody.phone`, E.164 or null); the rule is the generated schema's, never copied here.
// An empty control means "remove the number" (the store sends null), which the schema's string
// cannot say, so the schema is widened to accept '' and nothing else.
const profileSchema = object({ phone: either(field(zUpdateMeBody, 'phone'), literal('')) })

export function profileForm(initial = '') {
  return useSchemaForm(profileSchema, { phone: initial })
}
