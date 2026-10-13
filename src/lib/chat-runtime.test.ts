import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

test('compiled API entry loads its JavaScript dependencies and reports keyless status', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const output = await mkdtemp(join(root, '.chat-runtime-'));
  try {
    const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    assert.equal(parsed.errors.length, 0);
    // Emit the server dependency graph as separate files, as the function
    // runtime does. The output contains no TypeScript source to fall back to.
    for (const path of ['api/chat.ts', 'src/lib/chat-handler.ts', 'src/lib/chat-knowledge.ts', 'src/lib/ranking.ts', 'src/lib/evidence.ts', 'src/lib/submission.ts']) {
      const result = ts.transpileModule(await readFile(join(root, path), 'utf8'), {
        fileName: path, compilerOptions: parsed.options,
      });
      const target = join(output, path.replace(/\.ts$/, '.js'));
      await mkdir(dirname(target), {recursive: true});
      await writeFile(target, result.outputText);
    }
    await writeFile(join(output, 'package.json'), '{"type":"module"}');
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import entry from './api/chat.js';
      const response = await entry.fetch(new Request('https://example.com/api/chat'));
      console.log(JSON.stringify({status: response.status, body: await response.json()}));
    `], {cwd: output, encoding: 'utf8', env: {...process.env, ANTHROPIC_API_KEY: '', DISCORD_WEBHOOK_URL: ''}});
    assert.deepEqual(JSON.parse(result), {status: 200, body: {logging: false, stub: false, available: false}});
  } finally {
    await rm(output, {recursive: true, force: true});
  }
});
