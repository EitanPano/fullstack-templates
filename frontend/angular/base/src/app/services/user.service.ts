import { Injectable } from '@angular/core'

import type { PublicUser, UpdateMeBody } from '@app/models/user/type'

import { getApiUserMe, patchApiUserMe } from './generated/sdk.gen'

// The facade over the signed-in account: read it, change its phone number.
@Injectable({ providedIn: 'root' })
export class UserService {
  async me(): Promise<PublicUser> {
    const { data } = await getApiUserMe()
    return data
  }

  async update(body: UpdateMeBody): Promise<PublicUser> {
    const { data } = await patchApiUserMe({ body })
    return data
  }
}
