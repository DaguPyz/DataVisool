/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {unzipSync} from 'fflate';
import {Visloom} from '../src/visloom/index.ts';

const tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));

function extractStarter(files, root) {
    for (const [path, bytes] of Object.entries(files)) {
        const target = join(root, path);
        mkdirSync(dirname(target), {recursive: true});
        writeFileSync(target, bytes);
    }
    // Resolve the template's local SDK and installed type package without registry access.
    const modules = join(root, 'node_modules');
    const reactTypes = dirname(fileURLToPath(import.meta.resolve('@types/react/package.json')));
    mkdirSync(join(modules, '@datavisool'), {recursive: true});
    mkdirSync(join(modules, '@types'), {recursive: true});
    symlinkSync(join(root, 'sdk'), join(modules, '@datavisool/plugin-api'), 'junction');
    symlinkSync(reactTypes, join(modules, '@types/react'), 'junction');
}

test('plugin B gets typed service properties from only the declaration emitted by plugin A', async t => {
    const work = mkdtempSync(join(tmpdir(), 'datavisool-plugin-test-'));
    t.after(() => rmSync(work, {recursive: true, force: true}));
    const archive = join(work, 'template.zip');
    const build = fileURLToPath(new URL('./build-plugin-template.mjs', import.meta.url));
    execFileSync(process.execPath, [build, archive]);

    const files = unzipSync(readFileSync(archive));
    const provider = join(work, 'plugin-a');
    const consumer = join(work, 'plugin-b');
    extractStarter(files, provider);
    extractStarter(files, consumer);
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {cwd: provider});

    rmSync(join(consumer, 'src/contracts/report.ts'));
    const types = join(consumer, 'src/types');
    mkdirSync(types);
    copyFileSync(join(provider, 'dist/contracts/report.d.ts'), join(types, 'report.d.ts'));
    writeFileSync(join(consumer, 'src/index.ts'), `
import type {PluginContext, Plugin} from '@datavisool/plugin-api';
import type {} from '@datavisool/plugin-api/contracts/router';

export let formatted = '';
export let activeContext: PluginContext;

export function checkTypes(ctx: PluginContext) {
    // @ts-expect-error ReportService only accepts string titles.
    ctx.reports.formatTitle(123);
    // @ts-expect-error Undeclared methods are absent from the imported contract.
    ctx.reports.publish();
    return ctx.router.pathFor('app:home');
}

export default function createConsumer(): Plugin {
    return {
        id: 'example/report-consumer',
        requires: ['reports'],
        provides: [],
        activate(ctx) {
            activeContext = ctx;
            formatted = ctx.reports.formatTitle('  Monthly sales  ');
        },
    };
}
`);
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--skipLibCheck', 'false'], {cwd: consumer});

    const {default: createProvider} = await import(pathToFileURL(join(provider, 'dist/index.js')).href);
    const client = await import(pathToFileURL(join(consumer, 'dist/index.js')).href);
    const plugin = createProvider();
    const runtime = new Visloom();
    await assert.rejects(
        runtime.start([plugin, {...plugin, id: 'example/another-provider'}]),
        /has multiple providers/,
    );
    await assert.rejects(runtime.start([client.default()]), /requires service 'reports', which has no provider/);
    await assert.rejects(runtime.start([{...plugin, provides: ['provide']}]), /reserved service name 'provide'/);
    await runtime.start([client.default(), plugin]);
    assert.equal(client.formatted, 'Report: Monthly sales');
    assert.equal(client.activeContext.reports, runtime.get('reports'));
    await assert.rejects(runtime.stopPlugin(plugin.id), /required by plugins/);
    await runtime.stop();
    assert.throws(() => client.activeContext.reports, /context is no longer active/);
});
