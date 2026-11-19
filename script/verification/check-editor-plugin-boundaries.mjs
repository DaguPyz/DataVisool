/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(root, 'datavisool-app/src');
const require = createRequire(path.join(root, 'datavisool-app/package.json'));
const ts = require('typescript');
const entries = new Map([
    ['designer-runtime', 'designerRuntimePlugin.ts'],
    ['editor-shell', 'editorShellPlugin.tsx'],
    ['editor-canvas', 'editorCanvasPlugin.tsx'],
    ['editor-project', 'editorProjectPlugin.ts'],
    ['editor-inspector', 'editorInspectorPlugin.tsx'],
    ['editor-shortcuts', 'editorShortcutsPlugin.tsx'],
    ['editor-blueprint', 'editorBlueprintPlugin.tsx'],
    ['editor-component-library', 'editorComponentLibraryPlugin.tsx'],
    ['editor-resource-library', 'editorResourceLibraryPlugin.tsx'],
    ['editor-layers', 'editorLayersPlugin.tsx'],
    ['editor-template-library', 'editorTemplateLibraryPlugin.tsx'],
    ['editor-variables', 'editorVariablesPlugin.tsx'],
    ['editor-subprojects', 'editorSubprojectsPlugin.tsx'],
    ['editor-ai', 'editorAiPlugin.tsx'],
]);
const bootstrap = path.join(sourceRoot, 'bootstrap/appPlugins.ts');
const failures = [];
const creationNames = new Map();
const contextMethods = new Set(['provide', 'get', 'on', 'emit', 'onDispose', 'onStop']);
const visit = (node, inspect) => {
    inspect(node);
    ts.forEachChild(node, child => visit(child, inspect));
};
const relative = filename => path.relative(root, filename).split(path.sep).join('/');
const walk = directory => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : entry.isFile() ? [filename] : [];
});
const owner = filename => {
    const parts = path.relative(path.join(sourceRoot, 'plugins'), filename).split(path.sep);
    return parts.length > 1 && parts[0] !== '..' ? parts[0] : undefined;
};
const resolveImport = (filename, specifier) => {
    const target = specifier.startsWith('@/') ? path.join(sourceRoot, specifier.slice(2))
        : specifier.startsWith('.') ? path.resolve(path.dirname(filename), specifier) : undefined;
    if (!target) return;
    const base = target.replace(/\?.*$/, '');
    return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
        .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};

// Follow emitted imports, including re-exports, so a barrel cannot eagerly pull
// the canvas core into application startup. Type-only edges emit no runtime code.
const startupSources = new Set();
const inspectStartup = filename => {
    if (startupSources.has(filename) || !/\.[cm]?[jt]sx?$/.test(filename)) return;
    startupSources.add(filename);
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
        if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier) || statement.isTypeOnly) continue;
        if (ts.isImportDeclaration(statement) && statement.importClause) {
            const clause = statement.importClause;
            if (clause.isTypeOnly) continue;
            const named = clause.namedBindings;
            if (!clause.name && named && ts.isNamedImports(named)
                && named.elements.length && named.elements.every(item => item.isTypeOnly)) continue;
        }
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)
            && statement.exportClause.elements.length && statement.exportClause.elements.every(item => item.isTypeOnly)) continue;
        const target = resolveImport(filename, statement.moduleSpecifier.text);
        if (target) inspectStartup(target);
    }
};
inspectStartup(bootstrap);
for (const filename of startupSources) {
    const canvasPath = path.relative(path.join(sourceRoot, 'plugins/editor-canvas'), filename).split(path.sep).join('/');
    if (/^(editorCanvasRuntime\.tsx|history\/|state\/|viewport\/ViewportStore\.ts)/.test(canvasPath))
        failures.push(`Canvas runtime must load on demand instead of at startup: ${relative(filename)}`);
}

for (const [plugin, entry] of entries) {
    const filename = path.join(sourceRoot, 'plugins', plugin, entry);
    if (!fs.existsSync(filename)) { failures.push(`Missing plugin entry: ${relative(filename)}`); continue; }
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const exports = source.statements.filter(statement => ts.isExportDeclaration(statement)
        || ts.isExportAssignment(statement)
        || statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
    if (exports.length !== 1 || !ts.isFunctionDeclaration(exports[0])
        || !/^create\w+Plugin$/.test(exports[0].name?.text ?? '')) {
        failures.push(`${relative(filename)} must export exactly one plugin creation function`);
        continue;
    }
    creationNames.set(plugin, exports[0].name.text);
    const metadata = exports[0].body?.statements.find(ts.isReturnStatement)?.expression;
    if (!metadata || !ts.isObjectLiteralExpression(metadata)) {
        failures.push(`${relative(filename)} must return its declared plugin metadata`);
        continue;
    }
    const property = name => metadata.properties.find(item => ts.isPropertyAssignment(item) && item.name?.getText(source) === name)?.initializer;
    const id = property('id');
    if (!id || !ts.isStringLiteral(id) || id.text !== plugin)
        failures.push(`${relative(filename)} must declare plugin id '${plugin}'`);
    const declaration = name => {
        const values = property(name);
        if (!values || !ts.isArrayLiteralExpression(values) || values.elements.some(item => !ts.isStringLiteral(item))) {
            failures.push(`${relative(filename)} must declare a literal ${name} list`);
            return new Set();
        }
        const names = values.elements.map(item => item.text);
        if (new Set(names).size !== names.length) failures.push(`${relative(filename)} has duplicate ${name} entries`);
        return new Set(names);
    };
    const required = declaration('requires');
    const provided = declaration('provides');
    const declared = new Set([...required, ...provided]);
    const checkService = (name, node) => {
        if (contextMethods.has(name) || declared.has(name)) return;
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        failures.push(`${relative(filename)}:${line} reads undeclared service '${name}'`);
    };
    visit(source, node => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'context')
            checkService(node.name.text, node);
        if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'context'
            && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) checkService(node.argumentExpression.text, node);
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)
            && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === 'context') {
            node.name.elements.forEach(item => checkService((item.propertyName ?? item.name).getText(source), item));
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
            && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'context'
            && ['get', 'provide'].includes(node.expression.name.text)) {
            const name = node.arguments[0];
            const allowed = node.expression.name.text === 'provide' ? provided : declared;
            if (!name || !ts.isStringLiteral(name) || !allowed.has(name.text))
                failures.push(`${relative(filename)} calls context.${node.expression.name.text} with an undeclared service`);
        }
    });
}

const bootstrapSource = ts.createSourceFile(bootstrap, fs.readFileSync(bootstrap, 'utf8'), ts.ScriptTarget.Latest, true);
const appFactory = bootstrapSource.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'createAppPlugins');
const selected = appFactory?.body?.statements.find(ts.isReturnStatement)?.expression;
for (const [plugin, entry] of entries) {
    const imports = bootstrapSource.statements.filter(statement => ts.isImportDeclaration(statement)
        && resolveImport(bootstrap, statement.moduleSpecifier.text) === path.join(sourceRoot, 'plugins', plugin, entry));
    const bindings = imports.flatMap(statement => statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
        ? [...statement.importClause.namedBindings.elements] : []);
    const binding = bindings.find(item => (item.propertyName ?? item.name).text === creationNames.get(plugin));
    const count = selected && ts.isArrayLiteralExpression(selected) && binding
        ? selected.elements.filter(item => ts.isCallExpression(item) && ts.isIdentifier(item.expression) && item.expression.text === binding.name.text).length : 0;
    if (imports.length !== 1 || bindings.length !== 1 || count !== 1)
        failures.push(`${relative(bootstrap)} must import and select '${plugin}' exactly once through its creation function`);
}

for (const filename of walk(sourceRoot).filter(filename => /\.[cm]?[jt]sx?$/.test(filename))) {
    const content = fs.readFileSync(filename, 'utf8');
    const importer = owner(filename);
    if (entries.has(importer) && importer !== 'designer-runtime') {
        const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
        visit(source, node => {
            if ((!ts.isIdentifier(node) && !ts.isStringLiteral(node)) || node.text !== 'DATAVISOOL_ENV') return;
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            failures.push(`${relative(filename)}:${line} accesses the global component compatibility environment instead of a declared capability`);
        });
    }
    for (const reference of ts.preProcessFile(content, true, true).importedFiles) {
        const target = resolveImport(filename, reference.fileName);
        const provider = target && owner(target);
        if (!provider || provider === importer || (!entries.has(provider) && !entries.has(importer))) continue;
        const entry = entries.has(provider) && path.join(sourceRoot, 'plugins', provider, entries.get(provider));
        if (filename === bootstrap && target === entry) continue;
        const line = content.slice(0, reference.pos).split('\n').length;
        failures.push(`${relative(filename)}:${line} imports private ${provider} source ${relative(target)}`);
    }
}

// Preview and release page entrypoints stay in this directory for the explicitly deferred migration batch.
const legacy = path.join(sourceRoot, 'designer');
if (fs.existsSync(legacy)) {
    for (const filename of walk(legacy)) {
        const remaining = path.relative(legacy, filename).split(path.sep).join('/');
        if (/^(view|release)\//.test(remaining)) continue;
        failures.push(`Editor implementation still outside its plugin: ${relative(filename)}`);
    }
}

if (failures.length) {
    console.error(`Editor plugin boundary verification failed (${failures.length} findings):`);
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log('All 14 editor plugin entries, production selection, service declarations, source imports and legacy directory ownership verified.');
}
