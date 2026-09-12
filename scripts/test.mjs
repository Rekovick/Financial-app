/**
 * Bundles the TypeScript tests with esbuild (already present via Vite) and runs
 * them on Node's built-in test runner. Bundling keeps the source free of the
 * explicit `.ts` extensions Node's loader would otherwise demand.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const out = mkdtempSync(join(tmpdir(), 'ledgerly-test-'));

try {
  const entries = globSync('src/**/*.test.ts');
  if (!entries.length) {
    console.error('No test files found.');
    process.exit(1);
  }

  await build({
    entryPoints: entries,
    outdir: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    external: ['node:*'],
    logLevel: 'warning',
  });

  const unit = spawnSync(process.execPath, ['--test', `${out}/**/*.test.js`], { stdio: 'inherit' });
  const backend = spawnSync(process.execPath, ['apps-script/test/run.mjs'], { stdio: 'inherit' });
  process.exit(unit.status || backend.status || 0);
} finally {
  rmSync(out, { recursive: true, force: true });
}
