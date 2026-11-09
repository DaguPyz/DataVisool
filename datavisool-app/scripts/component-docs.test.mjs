/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {appRoot, describeDocument, generateComponentDocs} from './component-docs.mjs';

test('55 份组件文档按类型命名，48 份完整规格；索引不含正文和完整规则', () => {
    const dir = mkdtempSync(join(tmpdir(), 'datavisool-docs-'));
    try {
        const index = generateComponentDocs({outputRoot: join(dir, 'docs'), summaryFile: join(dir, 'summary.json')});
        assert.equal(index.documents.length, 55);
        assert.equal(index.documents.filter(d => d.hasFullSpec).length, 48);
        assert(index.documents.every(d => d.path.endsWith(`/${d.componentType}.md`)));
        assert(!JSON.stringify(index).includes('allowedStylePaths'));
        assert(!readFileSync(join(dir, 'summary.json'), 'utf8').includes('配置字段'));
        assert(index.documents.find(d => d.componentType === 'BaseText').sections['完整规格']);
    } finally {rmSync(dir, {recursive: true});}
});

test('修改、新增、删除会发布新索引；旧版本文件保持一致；无效修改不发布', () => {
    const dir = mkdtempSync(join(tmpdir(), 'datavisool-docs-')), sourceRoot = join(dir, 'source');
    mkdirSync(sourceRoot);
    const original = readFileSync(join(appRoot, 'src/comps/builtin/base-text/BaseText.md'), 'utf8');
    const options = {sourceRoot, outputRoot: join(dir, 'docs'), summaryFile: join(dir, 'summary.json')};
    const file = join(sourceRoot, 'BaseText.md');
    const definition = join(sourceRoot, 'BaseTextDefinition.ts');
    try {
        writeFileSync(file, original); writeFileSync(definition, 'compKey: "BaseText"');
        const old = generateComponentDocs(options);
        writeFileSync(file, original + '\n文档更新\n');
        const next = generateComponentDocs(options);
        assert.notEqual(old.corpusVersion, next.corpusVersion);
        writeFileSync(definition, 'compKey: "BaseText"\n// implementation changed');
        const codeChanged = generateComponentDocs(options);
        assert.equal(codeChanged.documents[0].sha256, next.documents[0].sha256);
        assert.notEqual(codeChanged.documents[0].componentVersion, next.documents[0].componentVersion);
        assert.equal(readFileSync(join(options.outputRoot, 'builtin', old.corpusVersion, old.documents[0].path), 'utf8'), original);
        writeFileSync(file, original.replace('"componentType": "BaseText"', '"componentType": "Wrong"'));
        assert.throws(() => generateComponentDocs(options), /类型/);
        assert.equal(JSON.parse(readFileSync(join(options.outputRoot, 'current.json'))).corpusVersion, codeChanged.corpusVersion);
        rmSync(file); rmSync(definition);
        assert.equal(generateComponentDocs(options).documents.length, 0);
    } finally {rmSync(dir, {recursive: true});}
});

test('文件名与类型不一致、格式错误和超大文档均拒绝', () => {
    const content = readFileSync(join(appRoot, 'src/comps/builtin/base-text/BaseText.md'), 'utf8');
    assert.throws(() => describeDocument(content, 'Other.md'), /类型/);
    assert.throws(() => describeDocument(content.replace('"componentName": "基础文本"', '"componentName":'), 'BaseText.md'));
    assert.throws(() => describeDocument(content + '字'.repeat(100000), 'BaseText.md'), /256 KiB/);
});

test('数据能力必须明确且不能同时声明支持与不支持', () => {
    const content = readFileSync(join(appRoot, 'src/comps/builtin/base-text/BaseText.md'), 'utf8');
    const declaration = '该组件支持通过 `dataPatch` 修改数据。';
    assert.throws(() => describeDocument(content.replace(declaration, ''), 'BaseText.md'), /完整规格/);
    assert.throws(() => describeDocument(content.replace(declaration,
        declaration + '\n该组件不支持通过 `dataPatch` 修改数据。'), 'BaseText.md'), /完整规格/);
});
