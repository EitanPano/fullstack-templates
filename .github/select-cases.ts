// The cases a pull request into `dev` runs: those of the templates it touches, or every case when
// it touches the generator or files every template shares. Reads ALL (the case list as JSON) and
// CHANGED (one changed path per line) from the environment; prints the selected list as JSON.
const all: string[] = JSON.parse(process.env.ALL ?? '[]')
const changed = (process.env.CHANGED ?? '').split('\n').filter(Boolean)

const wide = changed.some((p) => /^(tools|shared|stacks|schemas)\//.test(p) || p === 'index.yaml')
const touched = new Set(
  changed.map((p) => p.match(/^(frontend|server)\/[^/]+/)?.[0]).filter((t) => t !== undefined),
)
const selected = wide ? all : all.filter((c) => [...touched].some((t) => c.startsWith(`${t}/`)))

console.log(JSON.stringify(selected))
