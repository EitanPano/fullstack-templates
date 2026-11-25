import { defineConfig } from 'tsdown'

import { MODULE_SHEETS, cdnConfigs } from './tsdown.shared.ts'

// The e2e build: the same files as dist/cdn/v<major>/, with the fixture module registered
// on the real kernel. The e2e task serves this folder from a real API's SDK directory.
export default defineConfig(
  cdnConfigs({
    loader: 'tests/e2e/fixture-module/entry-cdn.ts',
    frame: 'tests/e2e/fixture-module/entry-frame.ts',
    outDir: 'tests/e2e/.build/cdn',
    moduleSheets: ['tests/e2e/fixture-module/*.css', ...MODULE_SHEETS],
  }),
)
