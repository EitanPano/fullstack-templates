<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { NEXT_PARAM } from '@/models/user/constants'
import BaseInput from '@/shared/components/base-input.vue'
import AuthCard from '@/shared/components/auth-card.vue'
import FormActions from '@/shared/components/form-actions.vue'
import FormField from '@/shared/components/form-field.vue'
import { autofocus as vAutofocus } from '@/shared/directives/autofocus'
import { safeNextPath } from '@/shared/utils/next-path'
import { applyFieldErrors } from '@/shared/validators/server-errors'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'

import { loginForm } from './auth.form'

// The sign-in screen. The store toasts every failure but `validation_failed`; that one lands on
// the fields, and the page toasts only for the paths no field shows. `next` (the route's query
// parameter) is where to go after signing in; anything but a path on this site is the home page.
const auth = useAuthStore()
const { loading } = storeToRefs(auth)
const notifications = useNotificationStore()
const route = useRoute()
const router = useRouter()
const form = loginForm()

const next = computed(() => {
  const value = route.query[NEXT_PARAM]
  return typeof value === 'string' ? value : undefined
})
const registerLink = computed(() =>
  next.value ? { path: '/auth/register', query: { [NEXT_PARAM]: next.value } } : '/auth/register',
)

async function submit(): Promise<void> {
  await form.submit(async (credentials) => {
    if (await auth.login(credentials)) {
      await router.push(safeNextPath(next.value))
      return
    }
    const error = auth.error
    if (error?.code !== 'validation_failed') return
    const unmapped = applyFieldErrors(form, error)
    if (unmapped.length > 0 || !error.fieldErrors) {
      notifications.showError('errors.validation_failed')
    }
  })
}
</script>

<template>
  <AuthCard :heading="$t('auth.login.title')" :description="$t('auth.login.description')">
    <form class="login__form" novalidate @submit.prevent="submit">
      <FormField :label="$t('auth.email')" :error="form.errorText('email')">
        <BaseInput
          v-model="form.values.email"
          v-autofocus
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          @blur="form.touch('email')"
        />
      </FormField>
      <FormField :label="$t('auth.password')" :error="form.errorText('password')">
        <BaseInput
          v-model="form.values.password"
          type="password"
          name="password"
          autocomplete="current-password"
          @blur="form.touch('password')"
        />
      </FormField>
      <FormActions submit-key="auth.login.submit" :pending="loading" />
    </form>
    <template #footer>
      <p class="login__alt">
        {{ $t('auth.login.noAccount') }}
        <RouterLink :to="registerLink">{{ $t('auth.login.registerLink') }}</RouterLink>
      </p>
    </template>
  </AuthCard>
</template>

<style lang="scss" src="./login-page.scss"></style>
