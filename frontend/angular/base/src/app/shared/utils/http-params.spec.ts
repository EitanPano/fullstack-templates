import { toHttpParams } from './http-params'

describe('toHttpParams', () => {
  it('stringifies values and repeats an array under one key', () => {
    expect(toHttpParams({ page: 2, active: false, q: 'rose', tag: ['a', 'b'] })).toEqual({
      page: '2',
      active: 'false',
      q: 'rose',
      tag: ['a', 'b'],
    })
  })

  it('drops undefined and null, also inside arrays, and keeps zero and empty text', () => {
    expect(
      toHttpParams({ a: undefined, b: null, c: 0, d: '', e: [undefined, null], f: ['x', null] }),
    ).toEqual({ c: '0', d: '', f: ['x'] })
  })

  it('returns an empty object for nothing', () => {
    expect(toHttpParams({})).toEqual({})
  })
})
