import { z } from 'zod'

// The generated schemas carry the API's limits (min 8, max 254) with zod's default wording.
// One global message map turns the common ones into text a person can act on, in the browser
// (the form resolver) and on the server (the action's input schema) alike. It only words an
// issue; it never changes a limit.
z.config({
  customError: (issue) => {
    if (issue.code === 'too_small' && issue.origin === 'string') {
      return `Use at least ${String(issue.minimum)} characters`
    }
    if (issue.code === 'too_big' && issue.origin === 'string') {
      return `Use ${String(issue.maximum)} characters or fewer`
    }
    if (issue.code === 'too_small' && issue.origin === 'number') {
      return `Enter ${String(issue.minimum)} or more`
    }
    if (issue.code === 'too_big' && issue.origin === 'number') {
      return `Enter ${String(issue.maximum)} or less`
    }
    if (issue.code === 'invalid_format' && issue.format === 'email') {
      return 'Enter a valid email address'
    }
    if (issue.code === 'invalid_type' && issue.input === undefined) return 'Required'
    return undefined
  },
})
