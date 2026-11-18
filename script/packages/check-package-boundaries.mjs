/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];
const read = relative => readFile(path.join(root, relative), 'utf8');

async function* sources(relative) {
    for (const entry of await readdir(path.join(root, relative), {withFileTypes: true})) {
        if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
        const name = path.join(relative, entry.name);
        if (entry.isDirectory()) yield* sources(name);
        else if (/\.(?:tsx?|jsx?|html)$/.test(name)) yield name;
    }
}

const packages = ['datavisool-sdk', 'datavisool-ui'];
const manifests = await Promise.all(packages.map(async dir => [dir, JSON.parse(await read(`${dir}/package.json`))]));
const names = new Set(manifests.map(([, manifest]) => manifest.name));
for (const [dir, manifest] of manifests) {
    assert.equal(manifest.name, dir === 'datavisool-sdk' ? '@datavisool/sdk' : '@datavisool/ui');
    assert.equal(manifest.publishConfig?.access, 'public', `${dir} must publish publicly`);
    assert.ok(manifest.exports?.['.'], `${dir} must expose a public root entry`);
    const dependencies = Object.keys({...manifest.dependencies, ...manifest.peerDependencies});
    assert.ok(!dependencies.includes('datavisool-app'), `${dir} cannot depend on the application`);
    if (dir === 'datavisool-ui') assert.ok(!dependencies.some(name => names.has(name)), 'UI cannot depend on SDK or data contracts');
    if (dir === 'datavisool-sdk') assert.ok(!dependencies.includes('@datavisool/ui'), 'SDK cannot depend on UI');
    if (dir === 'datavisool-sdk') assert.ok(!dependencies.includes('lcp-types'), 'SDK types must be internal');
}

for (const dir of ['datavisool-sdk/src/types', 'datavisool-sdk/src', 'datavisool-ui/src']) {
    for await (const file of sources(dir)) {
        const text = await read(file);
        if (/datavisool-app|@tauri-apps|LC_ENV|DATAVISOOL_ENV|AuthTools/.test(text)) failures.push(`${file}: application dependency in a public package`);
        if (dir === 'datavisool-sdk/src/types' && /["'](?:react|react-dom|@datavisool\/(?:sdk|ui))(?:["'/])/.test(text)) {
            failures.push(`${file}: framework dependency in data contracts`);
        }
        if (dir === 'datavisool-sdk/src' && /["']@datavisool\/ui(?:["'/])/.test(text)) failures.push(`${file}: SDK cannot import UI`);
    }
}

for (const dir of ['datavisool-app/src', 'datavisool-app/tests', 'datavisool-cli/template/src']) {
    for await (const file of sources(dir)) {
        const text = await read(file);
        if (/["'](?:lcp-types\/types|(?:@datavisool\/ui|datavisool-ui|@(?:puyinzhen|zhensq)\/lcp-ui)\/(?:src|dist))\//.test(text)) {
            failures.push(`${file}: use a public package entry, not a source or dist path`);
        }
        if (/["']lcp-(?:interface|util|types)(?:\/[^"']*)?["']/.test(text)) {
            failures.push(`${file}: use SDK or UI instead of the removed packages`);
        }
        if (/["']datavisool-(?:sdk|ui)(?:\/[^"']*)?["']/.test(text)) {
            failures.push(`${file}: use the @datavisool scoped package names`);
        }
    }
}

assert.deepEqual(failures, [], failures.join('\n'));
console.log('Package boundaries verified.');
