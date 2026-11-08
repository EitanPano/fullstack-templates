import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick, ref, type PropType } from 'vue'

import { createHasRoleDirective } from './has-role'

const roles = ref<readonly string[]>([])

function mount(value: string | readonly string[]) {
  const Host = defineComponent({
    directives: { hasRole: createHasRoleDirective(roles) },
    props: {
      wanted: { type: [String, Array] as PropType<string | readonly string[]>, required: true },
    },
    template: '<button v-has-role="wanted">Admin area</button>',
  })
  return render(Host, { props: { wanted: value } })
}

describe('v-has-role', () => {
  it('hides the element from a visitor', () => {
    roles.value = []
    mount('admin')

    expect(screen.queryByRole('button', { name: 'Admin area' })).not.toBeInTheDocument()
  })

  it('hides it from an account with another role', () => {
    roles.value = ['user']
    mount('admin')

    expect(screen.queryByRole('button', { name: 'Admin area' })).not.toBeInTheDocument()
  })

  it('shows it to an account that holds the role', () => {
    roles.value = ['admin']
    mount('admin')

    expect(screen.getByRole('button', { name: 'Admin area' })).toBeVisible()
  })

  it('shows it when the account holds one of several roles', () => {
    roles.value = ['user']
    mount(['admin', 'user'])

    expect(screen.getByRole('button', { name: 'Admin area' })).toBeVisible()
  })

  it('follows the roles as they change, with no re-render of the host', async () => {
    roles.value = []
    mount('admin')

    roles.value = ['admin']
    await nextTick()
    expect(screen.getByRole('button', { name: 'Admin area' })).toBeVisible()

    roles.value = []
    await nextTick()
    expect(screen.queryByRole('button', { name: 'Admin area' })).not.toBeInTheDocument()
  })

  it('follows the wanted role when the binding changes', async () => {
    roles.value = ['user']
    const view = mount('admin')
    expect(screen.queryByRole('button', { name: 'Admin area' })).not.toBeInTheDocument()

    await view.rerender({ wanted: 'user' })

    expect(screen.getByRole('button', { name: 'Admin area' })).toBeVisible()
  })
})
