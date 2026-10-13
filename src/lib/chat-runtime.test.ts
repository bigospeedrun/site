import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {join, dirname, relative, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

// Emit the server dependency graph as separate files, as the function runtime
// does. The graph follows the relative imports in the emitted JavaScript, so
// type-only imports drop out and a new runtime import needs no list update.
async function emitImportGraph(root: string, entry: string, output: string, options: ts.CompilerOptions): Promise<string[]> {
  const emitted: string[] = [];
  const pending = [entry];
  while (pending.length) {
    const path = pending.pop()!;
    if (emitted.includes(path)) continue;
    emitted.push(path);
    const result = ts.transpileModule(await readFile(join(root, path), 'utf8'), {fileName: path, compilerOptions: options});
    const target = join(output, path.replace(/\.ts$/, '.js'));
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, result.outputText);
    for (const {fileName: specifier} of ts.preProcessFile(result.outputText, true, true).importedFiles) {
      if (!specifier.startsWith('.')) continue;
      const imported = relative(root, resolve(root, dirname(path), specifier)).replace(/\.js$/, '.ts');
      // A missing module fails here, with both names, instead of inside the runtime.
      await access(join(root, imported)).catch(() => { throw new Error(`${path} imports ${specifier}, but ${imported} does not exist`); });
      pending.push(imported);
    }
  }
  return emitted.sort();
}

async function compilerOptions(root: string) {
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.equal(parsed.errors.length, 0);
  return parsed.options;
}

test('the import graph follows runtime imports and fails loudly on a missing module', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-graph-'));
  try {
    await mkdir(join(root, 'lib'));
    await writeFile(join(root, 'entry.ts'), "import {a} from './lib/a.ts';\nimport type {T} from './lib/types.ts';\nexport const x: T = a;\n");
    await writeFile(join(root, 'lib/a.ts'), "export const a = 1;\n");
    const options = {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, rewriteRelativeImportExtensions: true, verbatimModuleSyntax: true};
    const output = join(root, 'out');
    assert.deepEqual(await emitImportGraph(root, 'entry.ts', output, options), ['entry.ts', 'lib/a.ts']);
    await writeFile(join(root, 'lib/a.ts'), "export {b as a} from './missing.ts';\n");
    await assert.rejects(emitImportGraph(root, 'entry.ts', join(root, 'out2'), options), /lib\/a\.ts imports \.\/missing\.js, but lib\/missing\.ts does not exist/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('compiled API entry loads its JavaScript dependencies and reports keyless status', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const output = await mkdtemp(join(root, '.chat-runtime-'));
  try {
    // The output contains no TypeScript source to fall back to.
    const emitted = await emitImportGraph(root, 'api/chat.ts', output, await compilerOptions(root));
    assert.ok(emitted.includes('src/lib/chat-handler.ts'), 'the graph reaches the chat handler');
    await writeFile(join(output, 'package.json'), '{"type":"module"}');
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import entry from './api/chat.js';
      const response = await entry.fetch(new Request('https://example.com/api/chat'));
      console.log(JSON.stringify({status: response.status, body: await response.json()}));
    `], {cwd: output, encoding: 'utf8', env: {...process.env, ANTHROPIC_API_KEY: '', DISCORD_WEBHOOK_URL: '', DISCORD_CHAT_LOG_WEBHOOK_URL: ''}});
    assert.deepEqual(JSON.parse(result), {status: 200, body: {logging: false, stub: false, available: false}});
  } finally {
    await rm(output, {recursive: true, force: true});
  }
});
