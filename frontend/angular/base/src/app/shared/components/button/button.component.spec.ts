import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { ButtonComponent } from './button.component'

@Component({
  imports: [ButtonComponent],
  template: `
    <app-button
      [variant]="variant()"
      [size]="size()"
      [loading]="loading()"
      [disabled]="disabled()"
      [link]="link()"
      [ariaLabel]="label()"
      (click)="clicks = clicks + 1"
      >Save</app-button
    >
  `,
})
class HostComponent {
  variant = signal<'primary' | 'danger'>('primary')
  size = signal<'md' | 'icon'>('md')
  loading = signal(false)
  disabled = signal(false)
  link = signal<string | null>(null)
  label = signal<string | null>(null)
  clicks = 0
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  return { fixture, element, host: fixture.componentInstance }
}

describe('ButtonComponent', () => {
  it('reports an icon button without an ariaLabel in dev mode', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    const fixture = TestBed.createComponent(ButtonComponent)
    fixture.componentRef.setInput('size', 'icon')
    await fixture.whenStable()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ariaLabel'))
    error.mockClear()
    fixture.componentRef.setInput('ariaLabel', 'Close')
    await fixture.whenStable()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('renders a type=button with the variant class and clicks through', async () => {
    const { fixture, element, host } = await render()
    const button = element.querySelector('button')
    expect(button?.getAttribute('type')).toBe('button')
    expect(button?.className).toContain('button--primary')
    button?.click()
    expect(host.clicks).toBe(1)
    expect(fixture).toBeTruthy()
  })

  it('applies the variant and size classes and the aria-label of an icon button', async () => {
    const { fixture, element, host } = await render()
    host.variant.set('danger')
    host.size.set('icon')
    host.label.set('Close')
    await fixture.whenStable()
    const button = element.querySelector('button')
    expect(button?.className).toContain('button--danger')
    expect(button?.className).toContain('button--icon')
    expect(button?.getAttribute('aria-label')).toBe('Close')
  })

  it('is busy and inert while loading, with a silent spinner', async () => {
    const { fixture, element, host } = await render()
    host.loading.set(true)
    await fixture.whenStable()
    const button = element.querySelector('button')
    expect(button?.getAttribute('aria-busy')).toBe('true')
    expect(button?.disabled).toBe(true)
    expect(button?.querySelector('[role="status"]')).toBeNull()
    expect(button?.querySelector('.spinner')).not.toBeNull()
    button?.click()
    expect(host.clicks).toBe(0)
  })

  it('does not click when disabled', async () => {
    const { fixture, element, host } = await render()
    host.disabled.set(true)
    await fixture.whenStable()
    element.querySelector('button')?.click()
    expect(host.clicks).toBe(0)
  })

  it('renders a link instead of a button when link is set', async () => {
    const { fixture, element, host } = await render()
    host.link.set('/')
    await fixture.whenStable()
    expect(element.querySelector('button')).toBeNull()
    const anchor = element.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('/')
    expect(anchor?.textContent).toContain('Save')
  })

  it('adds the block class only when the block input is set', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    const fixture = TestBed.createComponent(ButtonComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('button')?.className).not.toContain('button--block')
    fixture.componentRef.setInput('block', true)
    await fixture.whenStable()
    expect(element.querySelector('button')?.className).toContain('button--block')
  })
})
