/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staging = await mkdtemp(path.join(tmpdir(), 'datavisool-package-check-'));
const packages = ['datavisool-ui', 'datavisool-sdk', 'datavisool-interaction-engine', 'datavisool-cli'];
const appRequire = createRequire(path.join(root, 'datavisool-app/package.json'));
const run = (command, args, cwd = staging) => execFileSync(command, args, {cwd, encoding: 'utf8', stdio: 'pipe'});

async function javascriptClosure(entry, visited = new Set()) {
    if (visited.has(entry)) return visited;
    visited.add(entry);
    const text = await readFile(entry, 'utf8');
    for (const [, specifier] of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
        if (specifier.startsWith('.')) await javascriptClosure(path.resolve(path.dirname(entry), specifier), visited);
    }
    return visited;
}

try {
    const archives = path.join(staging, 'archives');
    await mkdir(archives);
    for (const dir of packages) {
        const manifest = JSON.parse(await readFile(path.join(root, dir, 'package.json'), 'utf8'));
        const before = new Set(await readdir(archives));
        run('pnpm', ['pack', '--pack-destination', archives], path.join(root, dir));
        const archive = (await readdir(archives)).find(name => !before.has(name));
        assert.ok(archive, `No tarball created for ${dir}`);
        const destination = path.join(staging, 'node_modules', manifest.name);
        await mkdir(destination, {recursive: true});
        run('tar', ['-xzf', path.join(archives, archive), '-C', destination, '--strip-components=1']);
        const packed = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
        assert.ok(!JSON.stringify(packed.dependencies ?? {}).includes('workspace:'), `${dir}: unresolved workspace dependency`);
        if (dir === 'datavisool-ui') {
            const bundledLicense = await readFile(path.join(destination, 'licenses/codemirror/LICENSE'));
            const upstreamLicense = await readFile(path.join(root, dir, 'node_modules/codemirror/LICENSE'));
            assert.deepEqual(bundledLicense, upstreamLicense, 'Packed CodeMirror license must match the dependency');
        }
        for (const specifier of Object.values(packed.exports ?? {})) {
            const targets = typeof specifier === 'string' ? [specifier] : Object.values(specifier);
            for (const target of targets) await readFile(path.join(destination, target));
        }
    }

    // Only third-party dependencies are linked. Workspace packages come from their tarballs.
    for (const dependency of ['react', 'react-dom', '@icon-park/react', 'nanoid', 'react-router-dom', 'vite', 'less', 'chalk', 'commander', 'fs-extra', 'inquirer', '@vitejs/plugin-react']) {
        let source;
        const owners = ['chalk', 'commander', 'fs-extra', 'inquirer', '@vitejs/plugin-react', 'vite'].includes(dependency)
            ? ['datavisool-cli', 'datavisool-app', 'datavisool-sdk', 'datavisool-ui']
            : ['datavisool-app', 'datavisool-sdk', 'datavisool-ui', 'datavisool-cli'];
        for (const dir of owners) {
            try {
                source = await realpath(path.join(root, dir, 'node_modules', dependency));
                break;
            } catch { /* Try the package that owns this dependency. */ }
        }
        assert.ok(source, `Missing dependency ${dependency}; run pnpm install first`);
        const destination = path.join(staging, 'node_modules', dependency);
        await mkdir(path.dirname(destination), {recursive: true});
        await symlink(source, destination, 'dir');
    }
    await symlink(path.join(root, 'datavisool-app/node_modules/@types'), path.join(staging, 'node_modules/@types'), 'dir');
    await cp(path.join(root, 'datavisool-cli/template/src'), path.join(staging, 'src'), {recursive: true});
    await cp(path.join(root, 'datavisool-cli/template/tsconfig.json'), path.join(staging, 'tsconfig.json'));
    await writeFile(path.join(staging, 'package.json'), JSON.stringify({type: 'module'}));
    await writeFile(path.join(staging, 'src/public-api-check.ts'), `
import {AbstractController, AbstractDesignerController, BPExecutor, ObjectUtil} from '@datavisool/sdk';
import type {MenuInfo, MenuToConfigMappingType} from '@datavisool/sdk/core';
import type {ConfigureObjectFragments} from '@datavisool/sdk/utils';
import type {PluginContext} from '@datavisool/sdk/plugin';
import type {DesignerRuntimeService} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerCatalogAccess} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {DynamicScriptsService} from '@datavisool/sdk/plugin/contracts/dynamicScripts';
import {editorSelectionChangedKey, type EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorProjectService} from '@datavisool/sdk/plugin/contracts/editorProject';
import type {EditorShellService} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {EditorCommandService} from '@datavisool/sdk/plugin/contracts/editorCommands';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {DesignerBlueprintNodeRegistry} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {SHORTCUT_ACTION_IDS, type ShortcutActionId, type EditorShortcutInputQuery} from '@datavisool/sdk/plugin/contracts/editorShortcuts';
import {editorTemplateCreatedKey} from '@datavisool/sdk/plugin/contracts/editorTemplates';
import {localeChangedKey, type I18nService} from '@datavisool/sdk/plugin/contracts/i18n';
import type {IDesignerManager, ComponentAiFeatureInfo, StructuredSourceConfig} from '@datavisool/sdk/types';
import {DesignerScene} from '@datavisool/sdk/types';
import {RenderErrorBoundary} from '@datavisool/ui/feedback';
import {Button} from '@datavisool/ui/basic';
import {CodeEditor} from '@datavisool/ui/code-editor';
import {DatavisoolGUI, DatavisoolGUIUtil} from '@datavisool/ui/schema';
import type {DatavisoolGUIProps} from '@datavisool/ui/schema';
import {InteractionEngine, DATAVISOOL_INTERACTION_ENGINE_PACKAGE} from '@datavisool/interaction-engine';
export {AbstractController, AbstractDesignerController, BPExecutor, ObjectUtil, DesignerScene, RenderErrorBoundary, Button, CodeEditor, DatavisoolGUI, DatavisoolGUIUtil};
export type {MenuInfo, MenuToConfigMappingType, ConfigureObjectFragments, IDesignerManager, ComponentAiFeatureInfo, StructuredSourceConfig, DatavisoolGUIProps};
export {InteractionEngine, DATAVISOOL_INTERACTION_ENGINE_PACKAGE};
export const getI18n = (context: PluginContext): I18nService => context.i18n;
export const getDesignerRuntime = (context: PluginContext): DesignerRuntimeService => context.designerRuntime;
export const getDesignerCatalog = (context: PluginContext): DesignerCatalogAccess => context.designerCatalog;
export const getDynamicScripts = (context: PluginContext): DynamicScriptsService => context.dynamicScripts;
export const getEditorCanvas = (context: PluginContext): EditorCanvasService => context.editorCanvas;
export const getEditorProject = (context: PluginContext): EditorProjectService => context.editorProject;
export const getEditorShell = (context: PluginContext): EditorShellService => context.editorShell;
export const getEditorCommands = (context: PluginContext): EditorCommandService => context.editorCommands;
export const canvasToolShortcut: ShortcutActionId = SHORTCUT_ACTION_IDS.CANVAS_TOOL_HAND;
export const attachShortcutInput = (canvas: EditorCanvasService, query: EditorShortcutInputQuery): (() => void) => canvas.registerShortcutInput(query);
export const prepareInspectorDomain = (canvas: EditorCanvasService): Promise<EditorInspectorDomain> => canvas.prepareInspectorDomain();
export const prepareBlueprintNodes = (runtime: DesignerRuntimeService): Promise<DesignerBlueprintNodeRegistry> => runtime.prepareBlueprintNodes();
export {editorSelectionChangedKey, editorTemplateCreatedKey, localeChangedKey};
`);
    run(process.execPath, [appRequire.resolve('typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json']);
    const cli = path.join(staging, 'node_modules/datavisool-cli/bin/index.js');
    const currentStyles = await readFile(path.join(staging, 'node_modules/@datavisool/ui/dist/style.css'), 'utf8');
    assert.match(currentStyles, /\.datavisool-button\b/, 'Packed current UI must include new selectors');
    run(process.execPath, ['--input-type=module', '-e', `
        import {createRequire} from 'node:module';
        const require = createRequire(import.meta.url);
        const mappings = require('datavisool-cli/config/externals.js').externalGlobals;
        if (mappings['lcp-sdk'] || mappings['@zhensq/lcp-ui']) throw new Error('Legacy component mapping must not be included');
    `]);
    run(process.execPath, [cli, 'build', 'remote-button']);

    // Entry splitting must actually exclude the editor's modules, not just rename a barrel.
    for (const entry of ['feedback', 'basic']) {
        const closure = await javascriptClosure(path.join(staging, `node_modules/@datavisool/ui/dist/${entry}.js`));
        assert.ok(![...closure].some(file => /codemirror|CodeEditor|UIMap/.test(file)), `${entry} imports the code editor`);
    }
    const typeFiles = await javascriptClosure(path.join(staging, 'node_modules/@datavisool/sdk/dist/types.js'));
    for (const file of typeFiles) {
        const source = await readFile(file, 'utf8');
        assert.ok(!/(?:from\s*|import\s*)['"](?:react|react-dom|@datavisool\/ui)(?:\/|['"])/.test(source), 'SDK types must not import React or UI');
    }
    console.log('Packed public APIs, CLI scaffold build, and UI entry isolation verified.');
} catch (error) {
    console.error(error.stdout?.toString() || error.message);
    if (error.stderr) console.error(error.stderr.toString());
    process.exitCode = 1;
} finally {
    await rm(staging, {recursive: true, force: true});
}
