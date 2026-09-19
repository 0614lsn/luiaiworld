import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { articleFixture, siteTestPaths } from '../tests/helpers/site-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.CONTENT_TEST_RUN = randomUUID();
const { base, content, dist } = siteTestPaths(root);
const env = { ...process.env };
delete env.CONTENT_PREVIEW_RELEASE;
await mkdir(content, { recursive: true });
const run = args => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const astro = join(root, 'node_modules/astro/bin/astro.mjs');
run([astro, 'build']);
await copyFile(join(dist, 'index.html'), join(base, 'empty-home.html'));
await copyFile(join(dist, 'articles/index.html'), join(base, 'empty-archive.html'));
await writeFile(join(content, 'test-guide.md'), articleFixture);
await writeFile(join(content, 'private-draft.md'), articleFixture.replace('status: published', 'status: draft') + '\nPRIVATE_DRAFT_SHOULD_NOT_APPEAR\n');
run([astro, 'build']);
const tests = (await readdir(join(root, 'tests'))).filter(file => file.endsWith('.test.mjs')).map(file => join(root, 'tests', file));
run(['--test', ...tests]);
