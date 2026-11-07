import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { AppComponent } from './app.component'

describe('AppComponent', () => {
  it('renders the router outlet', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents()
    const fixture = TestBed.createComponent(AppComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('router-outlet')).not.toBeNull()
  })
})
