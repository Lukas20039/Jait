#!/usr/bin/env node
/**
 * Guards the artifact rule: generated screenshots, reports and exports must land
 * inside the project's `.jait/` folder, never in a system temp directory.
 *
 * Specs and scripts that hardcode `/tmp/...` output paths silently scatter
 * reviewable files outside the project, where they are easily missed and later
 * deleted by temp cleaners. This check fails instead of letting that happen.
 *
 * It also catches two closely related failure modes:
 *   - paths anchored to the process working directory (`process.cwd()` or a
 *     `../../.jait/...` literal), which resolve outside the project whenever the
 *     suite is started from another folder; and
 *   - screenshots written somewhere under `.jait/` other than `.jait/shots/`.
 *
 * Fixture data that merely mentions a temp path (for example a mocked repo
 * `localPath`) is not an output and is ignored.
 *
 * Usage: node scripts/check-artifact-paths.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scanDirs = ['tests/e2e', 'scripts']
const skipDirs = new Set(['node_modules', 'test-results', 'playwright-report', 'dist', '.git'])
const extensions = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.py', '.sh'])
const allowMarker = 'artifact-path-check: allow'

const tmpPath = /\/tmp\/|\/var\/folders\/|os\.tmpdir\(\)/
// Only write-style calls matter. A bare mention of /tmp is usually fixture data.
const writeCall = /screenshot\s*\(|outputDir\s*:|writeFile\s*\(|mkdir\s*\(|const\s+output\s*=|output\s*=\s*[`'"]/
// A write call can span a few lines (`screenshot({\n path: '...'\n})`).
const lookahead = 3
// Relative artifact literals follow the process working directory, so they land
// outside the project (for example `/home/.jait/...`) when started elsewhere.
const cwdAnchored = /process\.cwd\(\)|(?:'|"|`)(?:\.\.\/)+\.jait\/|(?:'|"|`)\.\/\.jait\//
// `path.resolve(__dirname, '../../.jait/...')` is correctly anchored, so blank out
// those calls before looking for working-directory-relative paths.
const dirnameAnchored = /(?:resolve|join)\(\s*__dirname\s*,\s*(?:'|"|`)[^'"`]*(?:'|"|`)/g
// Screenshots belong in .jait/shots. Reports and exports belong in .jait/artifacts.
const screenshotCall = /screenshot\s*\(/
const jaitPath = /\.jait\//
const jaitShotsPath = /\.jait\/shots\//

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue
      yield* walk(join(dir, entry.name))
    } else if (extensions.has(extname(entry.name))) {
      yield join(dir, entry.name)
    }
  }
}

const violations = []

for (const dir of scanDirs) {
  for await (const file of walk(join(root, dir))) {
    const content = await readFile(file, 'utf8')
    if (content.includes(allowMarker)) continue
    const lines = content.split('\n')
    for (let index = 0; index < lines.length; index++) {
      if (!writeCall.test(lines[index])) continue
      const window = lines.slice(index, index + lookahead)
      const windowText = window.join('\n')
      const tmpHit = window.findIndex(line => tmpPath.test(line))
      if (tmpHit !== -1) {
        violations.push({
          file: relative(root, file),
          line: index + tmpHit + 1,
          text: window[tmpHit].trim(),
          reason: 'temp-directory',
        })
        continue
      }
      if (cwdAnchored.test(windowText.replace(dirnameAnchored, '__dirname_anchored__'))) {
        violations.push({
          file: relative(root, file),
          line: index + 1,
          text: lines[index].trim(),
          reason: 'cwd-anchored',
        })
        continue
      }
      if (screenshotCall.test(windowText) && jaitPath.test(windowText) && !jaitShotsPath.test(windowText)) {
        violations.push({
          file: relative(root, file),
          line: index + 1,
          text: lines[index].trim(),
          reason: 'wrong-folder',
        })
      }
    }
  }
}

const guidance = {
  'temp-directory': 'a system temp directory is outside the project and gets cleaned up',
  'cwd-anchored': 'a working-directory-relative path drifts when the suite runs from another folder',
  'wrong-folder': 'screenshots belong in .jait/shots/, not another folder under .jait/',
}

if (violations.length > 0) {
  console.error('Generated artifacts must be written inside the project .jait/ folder.\n')
  console.error('Use `.jait/shots/` for screenshots and `.jait/artifacts/` for reports, logs and exports,')
  console.error('and anchor the path with `path.resolve(__dirname, "../../.jait/...")`.\n')
  for (const { file, line, text, reason } of violations) {
    console.error(`  ${file}:${line}  [${reason}: ${guidance[reason]}]`)
    console.error(`    ${text}`)
  }
  console.error(`\n${violations.length} artifact path problem(s) found.`)
  process.exit(1)
}

console.log(`Artifact paths OK: all outputs in ${scanDirs.join(', ')} are project-anchored under .jait/.`)
