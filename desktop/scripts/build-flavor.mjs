#!/usr/bin/env node
/**
 * Builds one Windows installer flavour and renames the artifact so the two
 * packages do not overwrite each other.
 *
 *   node scripts/build-flavor.mjs full   # bundles ffmpeg (default package)
 *   node scripts/build-flavor.mjs slim   # leaves ffmpeg out, downloads on demand
 *
 * Tauri always names bundles `<productName>_<version>_<arch>-setup.exe`, so the
 * flavour has to be appended afterwards. `tauri build` sometimes reports a
 * non-zero exit code even after `Finished 1 bundle`, so the artifact on disk is
 * what decides success here.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const flavor = process.argv[2] ?? 'full'
if (!['full', 'slim'].includes(flavor)) {
	console.error(`unknown flavour "${flavor}" — expected "full" or "slim"`)
	process.exit(1)
}

const args = ['exec', 'tauri', 'build', '--bundles', 'nsis']
if (flavor === 'slim') {
	args.push('--config', 'src-tauri/tauri.slim.conf.json')
}

const build = spawnSync('pnpm', args, { stdio: 'inherit', shell: true })
if (build.error) {
	console.error(build.error)
	process.exit(1)
}

const nsisDir = join(process.cwd(), '..', 'target', 'release', 'bundle', 'nsis')
const plain = readdirSync(nsisDir).filter((name) => /_x64-setup\.exe$/.test(name))
if (plain.length !== 1) {
	console.error(`expected exactly one installer in ${nsisDir}, found: ${plain.join(', ') || 'none'}`)
	process.exit(1)
}

if (flavor === 'slim') {
	const from = plain[0]
	const to = from.replace(/-setup\.exe$/, '-setup-slim.exe')
	renameSync(join(nsisDir, from), join(nsisDir, to))
	console.log(`installer: ${to}`)
} else {
	console.log(`installer: ${plain[0]}`)
}
