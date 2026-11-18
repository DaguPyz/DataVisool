/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const template = join(appRoot, 'plugin-template');
const starter = join(template, 'starter');
const output = resolve(process.argv[2] ?? join(template, 'dist/datavisool-plugin-template.zip'));
const sdk = mkdtempSync(join(tmpdir(), 'datavisool-plugin-api-'));

try {
    const tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));
    execFileSync(process.execPath, [tsc, '-p', join(appRoot, 'tsconfig.plugin-sdk.json'), '--outDir', sdk], {
        stdio: 'inherit',
    });

    const files = Object.fromEntries([
        'README.md', 'package.json', 'tsconfig.json', 'src/index.ts', 'src/contracts/report.ts',
    ].map(path => [path, readFileSync(join(starter, path))]));
    files['LICENSE'] = readFileSync(join(appRoot, '../LICENSE'));
    files['sdk/package.json'] = readFileSync(join(template, 'sdk-package.json'));
    for (const file of readdirSync(sdk, {recursive: true})) {
        if (file.endsWith('.js') || file.endsWith('.d.ts')) {
            files['sdk/' + file.split(sep).join('/')] = readFileSync(join(sdk, file));
        }
    }

    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, zipSync(files));
    console.log(output);
} finally {
    rmSync(sdk, {recursive: true, force: true});
}
