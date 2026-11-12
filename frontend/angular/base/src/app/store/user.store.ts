import { effect, inject, untracked } from '@angular/core'
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals'

import type { Outcome } from '@app/models/api/type'
import type { PublicUser, UpdateMeBody } from '@app/models/user/type'
import { UserService } from '@app/services/user.service'

import { AuthStore } from './auth.store'
import { withRequestStatus } from './with-request-status'

interface UserState {
  profile: PublicUser | null
}

const INITIAL: UserState = { profile: null }

// The account's profile as the profile page reads and edits it. `AuthStore` answers who is signed
// in; this store holds the profile data, so a save here never touches the session. It holds an
// account's data, so it resets whenever nobody is signed in (sign-out, a refused refresh), which
// also drops an answer still in flight: the next account must never see, or save, this one's.
export const UserStore = signalStore(
  { providedIn: 'root' },
  withState<UserState>(INITIAL),
  withRequestStatus({ store: 'UserStore', calls: ['load', 'update'] }),
  withMethods((store, service = inject(UserService)) => ({
    reset(): void {
      store._resetCalls()
      patchState(store, INITIAL)
    },

    // A profile of another account must not show while this one loads.
    load(): Promise<Outcome<PublicUser>> {
      patchState(store, INITIAL)
      return store._call('load', () => service.me(), {
        onSuccess: (profile) => {
          patchState(store, { profile })
        },
      })
    },

    // A validation failure stays in `error('update')` for the page to put on its fields.
    update(body: UpdateMeBody): Promise<Outcome<PublicUser>> {
      return store._call('update', () => service.update(body), {
        mutation: true,
        form: true,
        onSuccess: (profile) => {
          patchState(store, { profile })
        },
      })
    },
  })),
  withHooks({
    onInit(store, auth = inject(AuthStore)) {
      effect(() => {
        if (auth.isLoggedIn()) return
        untracked(() => {
          store.reset()
        })
      })
    },
  }),
)
