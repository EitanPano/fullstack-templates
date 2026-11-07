import { PhonePipe } from './phone.pipe'

describe('PhonePipe', () => {
  const pipe = new PhonePipe()

  it('groups a North American number', () => {
    expect(pipe.transform('+14155550132')).toBe('+1 (415) 555-0132')
  })

  it('groups other numbers after their calling code', () => {
    expect(pipe.transform('+442071838750')).toBe('+44 207 183 8750')
    expect(pipe.transform('+972541234567')).toBe('+972 541 234 567')
    expect(pipe.transform('+74951234567')).toBe('+7 495 123 4567')
  })

  it('returns anything that is not E.164 unchanged', () => {
    expect(pipe.transform('055-123-4567')).toBe('055-123-4567')
    expect(pipe.transform('+1 415')).toBe('+1 415')
    expect(pipe.transform('hello')).toBe('hello')
  })

  it('returns an empty string for null and undefined', () => {
    expect(pipe.transform(null)).toBe('')
    expect(pipe.transform(undefined)).toBe('')
  })
})
