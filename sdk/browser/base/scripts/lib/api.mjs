// The public surface is a contract (ADR 0020 T2.11): api-extractor reads dist/index.d.ts and the
// result is compared with the committed report etc/sdk.api.txt. `--update` rewrites the report. A
// type the surface uses but does not export is an error, not a warning. The report is kept with
// its release tags written as `// public`: the catalog generator reads `// @tag` as a marker.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'

export function runApi({ root, update }) {
  mkdirSync(join(root, 'etc'), { recursive: true })
  mkdirSync(join(root, '.tmp', 'api-current'), { recursive: true })
  const configObject = {
    projectFolder: root,
    mainEntryPointFilePath: '<projectFolder>/dist/index.d.ts',
    // Only the declarations are read, so the project's tsconfig (sources and tests) is not.
    compiler: {
      overrideTsconfig: {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          lib: ['ES2022', 'DOM'],
          strict: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['dist/index.d.ts'],
      },
    },
    apiReport: {
      enabled: true,
      reportFolder: '<projectFolder>/.tmp/api-current/',
      reportFileName: 'sdk',
      reportTempFolder: '<projectFolder>/.tmp/api/',
    },
    docModel: { enabled: false },
    dtsRollup: { enabled: false },
    tsdocMetadata: { enabled: false },
    messages: {
      compilerMessageReporting: { default: { logLevel: 'error', addToApiReportFile: false } },
      extractorMessageReporting: {
        default: { logLevel: 'error', addToApiReportFile: false },
        'ae-missing-release-tag': { logLevel: 'none' },
        'ae-undocumented': { logLevel: 'none' },
      },
      tsdocMessageReporting: { default: { logLevel: 'none' } },
    },
  }
  const prepared = ExtractorConfig.prepare({
    configObject,
    configObjectFullPath: join(root, 'api-extractor.json'),
    packageJsonFullPath: join(root, 'package.json'),
    // The report is named for the surface, not the project: it is valid in every generated project.
    packageJson: { name: 'sdk', version: '1.0.0' },
  })
  // A local build always writes the current report; the comparison is ours.
  const result = Extractor.invoke(prepared, { localBuild: true, showVerboseMessages: false })
  if (!result.succeeded) return false
  const lf = (text) => text.split('\r\n').join('\n')
  const current = lf(readFileSync(join(root, '.tmp', 'api-current', 'sdk.api.md'), 'utf8')).replace(
    /^\/\/ @/gm,
    '// ',
  )
  const committed = join(root, 'etc', 'sdk.api.txt')
  if (update) {
    writeFileSync(committed, current)
    return true
  }
  return existsSync(committed) && lf(readFileSync(committed, 'utf8')) === current
}
