// Empties the folders given as arguments, so a build never keeps a file of an earlier one.
import { rmSync } from 'node:fs'

for (const dir of process.argv.slice(2)) rmSync(dir, { recursive: true, force: true })
