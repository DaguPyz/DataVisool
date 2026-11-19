/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'datavisool-app/dist');
const require = createRequire(path.join(root, 'datavisool-app/package.json'));
const ts = require('typescript');
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)]
    .map(match => path.resolve(output, match[1].replace(/^\//, '')));
if (!scripts.length) throw new Error('No production entry scripts were found.');
const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
    .filter(match => /\brel=["']modulepreload["']/.test(match[0]))
    .map(match => match[0].match(/\bhref=["']([^"']+)["']/)?.[1])
    .filter(href => href?.endsWith('.js'))
    .map(href => path.resolve(output, href.replace(/^\//, '')));
const initialScripts = [...scripts, ...preloads];

const imports = new Map();
function inspect(filename) {
    if (imports.has(filename)) return;
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edges = {static: [], dynamic: []};
    imports.set(filename, edges);
    const add = (kind, specifier) => {
        if (!specifier.startsWith('.')) return;
        const target = path.resolve(path.dirname(filename), specifier.split('?')[0]);
        if (!target.endsWith('.js')) return;
        edges[kind].push(target);
        inspect(target);
    };
    for (const statement of source.statements) {
        if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
            && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier))
            add('static', statement.moduleSpecifier.text);
    }
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) add('dynamic', node.arguments[0].text);
        ts.forEachChild(node, visit);
    };
    visit(source);
}
initialScripts.forEach(inspect);
function reachable(includeDynamic) {
    const seen = new Set();
    const visit = filename => {
        if (seen.has(filename)) return;
        seen.add(filename);
        const edges = imports.get(filename);
        for (const target of [...edges.static, ...(includeDynamic ? edges.dynamic : [])]) visit(target);
    };
    initialScripts.forEach(visit);
    return seen;
}
const initial = reachable(false);
const all = reachable(true);
const canvasChunks = fs.readdirSync(path.join(output, 'assets'))
    .filter(filename => /^editorCanvasRuntime-[^.]+\.js$/.test(filename))
    .map(filename => path.join(output, 'assets', filename));
if (!canvasChunks.length) throw new Error('The production Canvas runtime chunk is missing.');
for (const filename of canvasChunks) {
    if (initial.has(filename)) throw new Error(`Canvas runtime is eagerly imported: ${path.basename(filename)}`);
    if (!all.has(filename)) throw new Error(`Canvas runtime is unreachable: ${path.basename(filename)}`);
}
console.log(`Production Canvas runtime is reachable through dynamic imports only (${canvasChunks.length} chunk).`);
