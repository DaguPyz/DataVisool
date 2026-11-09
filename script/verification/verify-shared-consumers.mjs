/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktopRoot = process.argv[2] && path.resolve(process.argv[2]);
if (!desktopRoot || process.argv.length !== 3) {
    console.error('Usage: pnpm run verify:shared:both /path/to/DataVisool-Desktop');
    process.exit(2);
}

function run(cwd, args) {
    console.log(`\n${cwd}: pnpm ${args.join(' ')}`);
    const result = spawnSync('pnpm', args, {cwd, stdio: 'inherit'});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Command failed: pnpm ${args.join(' ')}`);
}

function hashes(dir, prefix = '') {
    const files = new Map();
    for (const entry of readdirSync(path.join(dir, prefix), {withFileTypes: true})) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) {
            for (const [name, hash] of hashes(dir, relative)) files.set(name, hash);
        } else if (entry.isFile()) {
            const data = readFileSync(path.join(dir, relative));
            files.set(relative, createHash('sha256').update(data).digest('hex'));
        } else {
            throw new Error(`Unexpected entry in package output: ${relative}`);
        }
    }
    return files;
}

try {
    const desktopApp = path.join(desktopRoot, 'datavisool-app');
    const webApp = path.join(webRoot, 'datavisool-app');
    run(desktopRoot, ['run', 'build:packages']);
    run(desktopApp, ['exec', 'vitest', 'run', 'tests/component/component-sdk.test.tsx',
        'tests/component/remote-component-sdk.test.ts', 'tests/component/datavisool-gui-translation.test.tsx',
        'tests/component/sdk-render-recovery.test.tsx', 'tests/component/shared-ui-code-editor.test.tsx']);
    run(desktopApp, ['exec', 'tsc', '--noEmit']);
    run(desktopApp, ['run', 'build:local']);
    console.log('Web verification currently runs the Playwright smoke test and build; legacy shared-component tests have not been migrated.');
    run(webApp, ['run', 'verify:shared']);

    let differs = false;
    for (const [name, sourceDir] of [['sdk', 'datavisool-sdk'], ['ui', 'datavisool-ui'],
        ['interaction-engine', 'datavisool-interaction-engine']]) {
        const source = path.join(desktopRoot, sourceDir);
        const installed = path.join(webApp, 'node_modules', '@datavisool', name);
        const sourcePackage = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
        const installedPackage = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
        const expectedName = `@datavisool/${name}`;
        if (sourcePackage.name !== expectedName || installedPackage.name !== expectedName ||
            sourcePackage.version !== installedPackage.version) {
            console.error(`${expectedName}: package name or version differs`);
            differs = true;
            continue;
        }
        const a = hashes(path.join(source, 'dist'));
        const b = hashes(path.join(installed, 'dist'));
        const changed = [...new Set([...a.keys(), ...b.keys()])].filter(key => a.get(key) !== b.get(key));
        console.log(`${expectedName}@${sourcePackage.version}: ${changed.length} differing files`);
        if (changed.length) {
            console.error(changed.slice(0, 15).map(file => `  ${file}`).join('\n'));
            differs = true;
        }
    }
    if (differs) throw new Error('Shared package outputs do not match installed Web packages.');
    console.log('Desktop checks, Web browser smoke test, and shared package outputs verified.');
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
