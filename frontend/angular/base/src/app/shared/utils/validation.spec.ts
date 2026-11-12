import { check, either, field, literal, number, object, pick, text, validate } from './validation'

describe('validation', () => {
  it('returns the value of a valid input', () => {
    const schema = object({ name: text({ min: 2 }), age: number({ min: 18 }) })
    expect(validate(schema, { name: 'Ada', age: 30 })).toEqual({
      ok: true,
      value: { name: 'Ada', age: 30 },
    })
  })

  it('reports a bound with its limit and whether the value is text', () => {
    const result = validate(object({ name: text({ min: 8 }), age: number({ max: 5 }) }), {
      name: 'x',
      age: 9,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual([
      expect.objectContaining({ path: ['name'], kind: 'min', limit: 8, text: true }),
      expect.objectContaining({ path: ['age'], kind: 'max', limit: 5, text: false }),
    ])
  })

  it('reports a wrong type, a bad pattern and a failed check', () => {
    const schema = check(object({ code: text({ pattern: /^\d+$/ }) }), () => false, {
      message: 'never',
    })
    expect(validate(object({ code: text() }), {})).toMatchObject({
      ok: false,
      issues: [{ path: ['code'], kind: 'type' }],
    })
    expect(validate(object({ code: text({ pattern: /^\d+$/ }) }), { code: 'ab' })).toMatchObject({
      ok: false,
      issues: [{ kind: 'format', format: 'regex' }],
    })
    expect(validate(schema, { code: '12' })).toMatchObject({
      ok: false,
      issues: [{ path: [], kind: 'other', message: 'never' }],
    })
  })

  it('reuses one field, picks fields and accepts either of two schemas', () => {
    const user = object({ phone: text({ min: 3 }), email: text() })
    expect(validate(pick(user, ['phone']), { phone: '123' }).ok).toBe(true)
    expect(validate(pick(user, ['phone']), {}).ok).toBe(false)
    const optionalPhone = either(field(user, 'phone'), literal(''))
    expect(validate(optionalPhone, '').ok).toBe(true)
    expect(validate(optionalPhone, 'x').ok).toBe(false)
  })
})
