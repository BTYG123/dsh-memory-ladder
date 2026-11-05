import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
const argument = process.argv.indexOf('--exploration-root')
if (argument < 0) throw new Error('Supply --exploration-root path')
const root = resolve(process.argv[argument + 1])
const records = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.name === 'report.json' || /RESULTS\.md$/u.test(entry.name)) records.push({ path: relative(root, path).replaceAll('\\', '/'), text: await readFile(path, 'utf8') })
  }
}
await walk(join(root, 'results'))
const bundle = JSON.stringify({ kind: 'EXPLORATORY_HISTORY_NOT_NATIVE_RELEASE_EVIDENCE',
  limitations: 'Available historical reports, including mock runs and failures. Early versions did not save every auxiliary model response. Related templates and policies changed during exploration; no preregistration claim.', records })
if (process.env.DEEPSEEK_API_KEY && bundle.includes(process.env.DEEPSEEK_API_KEY)) throw new Error('Credential detected; export refused')
const compressed = gzipSync(bundle, { level: 9 })
const output = resolve('docs/evidence/exploration')
await mkdir(output, { recursive: true })
await writeFile(join(output, 'history.json.gz'), compressed)
await writeFile(join(output, 'SHA256SUMS'), createHash('sha256').update(compressed).digest('hex') + '  history.json.gz\n')
await writeFile(join(output, 'README.md'), '# Exploratory history\n\nAvailable reports from the earlier standalone prototype, including failed and mock runs. These are not native-plugin release scores. Early auxiliary calls were not all captured; the native-v1 evidence has complete request/response traces. See ../native-v1/RESULTS.md and ../../EVALUATION.md.\n')
console.log(`Exported ${records.length} historical records; ${compressed.length} compressed bytes`)
