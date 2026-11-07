import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { AuthCardComponent } from './auth-card.component'

@Component({
  imports: [AuthCardComponent],
  template: `
    <app-auth-card heading="Sign in" description="Welcome back">
      <p class="body">Form</p>
      <a footer href="/x">Other</a>
    </app-auth-card>
  `,
})
class HostComponent {}

@Component({
  imports: [AuthCardComponent],
  template: `<app-auth-card heading="Only" />`,
})
class BareComponent {}

describe('AuthCardComponent', () => {
  it('renders the heading as the one h1, the description, the content and the footer slot', async () => {
    const fixture = TestBed.createComponent(HostComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('h1')?.textContent).toBe('Sign in')
    expect(element.querySelector('.auth-card__description')?.textContent).toBe('Welcome back')
    expect(element.querySelector('.auth-card__content .body')).not.toBeNull()
    expect(element.querySelector('.auth-card__footer a')?.getAttribute('href')).toBe('/x')
  })

  it('omits the description when none is given', async () => {
    const fixture = TestBed.createComponent(BareComponent)
    await fixture.whenStable()
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.auth-card__description'),
    ).toBeNull()
  })
})
