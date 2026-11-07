import { TestBed } from '@angular/core/testing'

import { ModalService } from '@app/shared/components/modal/modal.service'

import { unsavedChangesGuard } from './unsaved-changes.guard'

describe('unsavedChangesGuard', () => {
  const confirm = vi.fn<(options: unknown) => Promise<boolean>>()

  function run(dirty: boolean) {
    TestBed.configureTestingModule({
      providers: [{ provide: ModalService, useValue: { confirm } }],
    })
    const component = { hasUnsavedChanges: () => dirty }
    return TestBed.runInInjectionContext(() =>
      unsavedChangesGuard(component, {} as never, {} as never, {} as never),
    )
  }

  beforeEach(() => {
    confirm.mockReset()
  })

  it('lets a clean page go without asking', () => {
    expect(run(false)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks before leaving unsaved changes and follows the answer', async () => {
    confirm.mockResolvedValue(false)
    expect(await run(true)).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })
})
