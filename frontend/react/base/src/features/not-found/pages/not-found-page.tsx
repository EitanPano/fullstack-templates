import { Link } from 'react-router'

// A URL no route claims. It says so and names the way back, inside the shell.
export function Component() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        That address does not lead anywhere. <Link to="/">Go to the home page</Link>.
      </p>
    </>
  )
}
