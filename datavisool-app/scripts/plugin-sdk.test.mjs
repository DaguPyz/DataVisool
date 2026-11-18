/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {PluginStopCancelledError} from '@datavisool/sdk/plugin';
import {Visloom} from '../src/visloom/index.ts';

const tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));

function createPluginProject(root) {
    const modules = join(root, 'node_modules');
    const sdk = dirname(dirname(fileURLToPath(import.meta.resolve('@datavisool/sdk/plugin'))));
    const reactTypes = dirname(fileURLToPath(import.meta.resolve('@types/react/package.json')));
    mkdirSync(join(root, 'src'), {recursive: true});
    mkdirSync(join(modules, '@datavisool'), {recursive: true});
    mkdirSync(join(modules, '@types'), {recursive: true});
    symlinkSync(sdk, join(modules, '@datavisool/sdk'), 'junction');
    symlinkSync(reactTypes, join(modules, '@types/react'), 'junction');
    writeFileSync(join(root, 'package.json'), JSON.stringify({type: 'module'}));
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
            target: 'ES2022', module: 'NodeNext', strict: true, declaration: true, rootDir: 'src', outDir: 'dist',
        },
        include: ['src'],
    }));
}

test('plugin B gets typed service properties from only the declaration emitted by plugin A', async t => {
    const work = mkdtempSync(join(tmpdir(), 'datavisool-plugin-test-'));
    t.after(() => rmSync(work, {recursive: true, force: true}));
    const provider = join(work, 'plugin-a');
    const consumer = join(work, 'plugin-b');
    createPluginProject(provider);
    createPluginProject(consumer);
    writeFileSync(join(provider, 'src/report.ts'), `
import type {} from '@datavisool/sdk/plugin';

export interface ReportService {
    formatTitle(title: string): string;
}

declare module '@datavisool/sdk/plugin' {
    interface PluginServices {
        reports: ReportService;
    }
}
`);
    writeFileSync(join(provider, 'src/index.ts'), `
import type {Plugin} from '@datavisool/sdk/plugin';
import type {} from './report.js';

export default function createProvider(): Plugin {
    return {
        id: 'example/report-provider',
        requires: [],
        provides: ['reports'],
        activate(ctx) {
            ctx.provide('reports', {formatTitle: title => 'Report: ' + title.trim()});
        },
    };
}
`);
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {cwd: provider});

    const types = join(consumer, 'src/types');
    mkdirSync(types);
    copyFileSync(join(provider, 'dist/report.d.ts'), join(types, 'report.d.ts'));
    writeFileSync(join(consumer, 'src/index.ts'), `
import type {PluginContext, Plugin} from '@datavisool/sdk/plugin';
import {homeRouteId} from '@datavisool/sdk/plugin/contracts/router';

export let formatted = '';
export let activeContext: PluginContext;

export function checkTypes(ctx: PluginContext) {
    // @ts-expect-error ReportService only accepts string titles.
    ctx.reports.formatTitle(123);
    // @ts-expect-error Undeclared methods are absent from the imported contract.
    ctx.reports.publish();
    return ctx.router.pathFor(homeRouteId);
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
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {cwd: consumer});

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

test('the Web runtime recognizes stop cancellation from the SDK', async () => {
    const runtime = new Visloom();
    const cancelled = new PluginStopCancelledError();
    let shouldCancel = true;
    await runtime.start([{
        id: 'example/cancel-stop',
        requires: [],
        provides: [],
        activate(ctx) {
            ctx.onStop({prepare() {
                if (shouldCancel) throw cancelled;
            }});
        },
    }]);
    await assert.rejects(runtime.stop(), error => error === cancelled);
    shouldCancel = false;
    await runtime.stop();
});
