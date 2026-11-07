import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { HasRoleDirective, ROLES } from './has-role.directive'

@Component({
  imports: [HasRoleDirective],
  template: `
    <p class="admin" *appHasRole="'admin'">admin</p>
    <p class="either" *appHasRole="['editor', 'admin']">either</p>
  `,
})
class HostComponent {}

describe('HasRoleDirective', () => {
  const roles = signal<readonly string[]>([])

  async function render() {
    TestBed.configureTestingModule({ providers: [{ provide: ROLES, useValue: roles }] })
    const fixture = TestBed.createComponent(HostComponent)
    await fixture.whenStable()
    return { fixture, element: fixture.nativeElement as HTMLElement }
  }

  beforeEach(() => {
    roles.set([])
  })

  it('renders nothing for a visitor', async () => {
    const { element } = await render()
    expect(element.querySelector('.admin')).toBeNull()
    expect(element.querySelector('.either')).toBeNull()
  })

  it('renders for a matching role, one of a list included', async () => {
    roles.set(['editor'])
    const { element } = await render()
    expect(element.querySelector('.admin')).toBeNull()
    expect(element.querySelector('.either')).not.toBeNull()
  })

  it('follows the roles as they change, without rendering twice', async () => {
    const { fixture, element } = await render()
    roles.set(['admin'])
    await fixture.whenStable()
    expect(element.querySelectorAll('.admin')).toHaveLength(1)
    roles.set(['admin', 'editor'])
    await fixture.whenStable()
    expect(element.querySelectorAll('.admin')).toHaveLength(1)
    roles.set([])
    await fixture.whenStable()
    expect(element.querySelector('.admin')).toBeNull()
  })

  it('defaults to no roles when nothing provides them', async () => {
    TestBed.configureTestingModule({})
    const fixture = TestBed.createComponent(HostComponent)
    await fixture.whenStable()
    expect((fixture.nativeElement as HTMLElement).querySelector('.admin')).toBeNull()
  })
})
