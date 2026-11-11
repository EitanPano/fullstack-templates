import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import AuthCard from './auth-card.vue'

describe('AuthCard', () => {
  it('is a section headed by the page h1, with the description under it', () => {
    render(AuthCard, { props: { heading: 'Sign in', description: 'Welcome back.' } })

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Welcome back.')).toBeInTheDocument()
  })

  it('renders the default slot and the footer slot', () => {
    render(AuthCard, {
      props: { heading: 'Sign in' },
      slots: { default: '<form aria-label="login"></form>', footer: '<a href="/x">Other</a>' },
    })

    expect(screen.getByRole('form', { name: 'login' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Other' })).toBeInTheDocument()
  })

  it('leaves the description out when there is none', () => {
    const { container } = render(AuthCard, { props: { heading: 'Sign in' } })

    expect(container.querySelector('.auth-card__description')).toBeNull()
  })
})
