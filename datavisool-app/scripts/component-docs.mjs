/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const docsRoot = process.env.DATAVISOOL_COMPONENT_DOCS_ROOT
    ? resolve(process.env.DATAVISOOL_COMPONENT_DOCS_ROOT) : resolve(appRoot, '../datavisool-server/datavisool-service/target/component-docs');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const MAX_DOCUMENT_BYTES = 256 * 1024;
const excluded = new Set(['G2PlotCustom', 'ECharts', 'AMap', 'MapLibreGis', 'LoopContainer']);
const walk = dir => readdirSync(dir, {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const jsonBlock = text => JSON.parse(/```json\s*([\s\S]*?)```/.exec(text)?.[1] || 'null');

export function sections(content) {
    const lines = content.split(/\r?\n/), headings = [];
    let fenced = false;
    lines.forEach((line, i) => {
        if (/^```/.test(line)) { fenced = !fenced; return; }
        if (fenced) return;
        const match = /^(#{2,6}) (.+)$/.exec(line);
        if (match) headings.push({title: match[2].trim(), level: match[1].length, startLine: i + 1});
    });
    return Object.fromEntries(headings.map((h, i) => {
        const next = headings.slice(i + 1).find(n => n.level <= h.level);
        return [h.title, {startLine: h.startLine, endLine: next ? next.startLine - 1 : lines.length}];
    }));
}

export function describeDocument(content, fileName) {
    if (Buffer.byteLength(content) > MAX_DOCUMENT_BYTES) throw new Error(`组件文档超过 256 KiB：${fileName}`);
    const chapterIndex = sections(content), lines = content.split(/\r?\n/);
    const chapter = title => {
        const range = chapterIndex[title];
        if (!range) throw new Error(`文档缺少 ${title}：${fileName}`);
        return lines.slice(range.startLine, range.endLine).join('\n');
    };
    const identity = jsonBlock(chapter('组件标识')), selection = jsonBlock(chapter('组件选择'));
    const type = identity?.componentType;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(type || '') || fileName !== `${type}.md`
        || !identity.componentName || selection?.componentType !== type || !selection.description || !selection.nativeCapabilities)
        throw new Error(`文档文件名、类型或选择说明无效：${fileName}`);
    const hasFullSpec = Boolean(chapterIndex['完整规格']);
    const refs = new Set();
    if (hasFullSpec) {
        const configurable = jsonBlock(chapter('配置字段'));
        const rules = jsonBlock(chapter('校验规则'));
        const requirements = chapter('数据要求');
        chapter('限制与校验');
        if (!configurable?.style || !Object.keys(configurable.style).length || rules?.componentType !== type
            || !Array.isArray(rules.allowedStylePaths)
            || requirements.includes('该组件支持通过 `dataPatch` 修改数据。')
                === requirements.includes('该组件不支持通过 `dataPatch` 修改数据。'))
            throw new Error(`完整规格或校验规则无效：${fileName}`);
        // 任何 JSON 块错误都中止生成，避免部署后才发现资料不可解析。
        for (const block of content.matchAll(/```json\s*([\s\S]*?)```/g)) JSON.parse(block[1]);
        const collect = value => {
            if (typeof value === 'string') {
                if (/^<g2plot-[a-z0-9-]+>$/.test(value)) refs.add(value);
                else if (/^(<g2plot|g2plot-)/i.test(value.trimStart())) throw new Error(`公共片段标签必须完整匹配：${value}`);
            } else if (value && typeof value === 'object') Object.values(value).forEach(collect);
        };
        collect(configurable);
    }
    return {componentType: type, componentName: identity.componentName, componentInfo: {...selection,
        selectable: hasFullSpec && !excluded.has(type) && selection.selectable !== false},
        hasFullSpec, sections: chapterIndex, sha256: sha256(content), bytes: Buffer.byteLength(content),
        fragmentRefs: [...refs].sort(), documentFormatVersion: 'component-document/v1'};
}

export function commonFragments(source) {
    const fragments = {};
    let label, body = [];
    for (const line of source.split(/\r?\n/)) {
        if (!/^<g2plot-[a-z0-9-]+>$/.test(line)) { if (label) body.push(line); continue; }
        if (!label) { label = line; body = []; continue; }
        if (line !== label || Object.hasOwn(fragments, label)) throw new Error(`公共片段边界无效：${line}`);
        const value = JSON.parse(body.join('\n'));
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`公共片段必须为对象：${label}`);
        fragments[label] = JSON.stringify(value);
        label = undefined;
    }
    if (label || !Object.keys(fragments).length) throw new Error('公共片段不完整');
    return fragments;
}

function atomicWrite(path, value) {
    mkdirSync(dirname(path), {recursive: true});
    if (existsSync(path) && readFileSync(path, 'utf8') === value) return;
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, value);
    renameSync(temp, path);
}

export function generateComponentDocs({sourceRoot = join(appRoot, 'src/comps'), outputRoot = docsRoot,
    summaryFile = join(appRoot, 'src/designer/ai-driven/generated/component-document-index.json'),
    fragmentFile = join(appRoot, 'src/frontend-effect/component-docs/G2Plot公共配置分块说明.md')} = {}) {
    const files = walk(sourceRoot), documents = [];
    for (const path of files.filter(p => p.endsWith('.md'))) {
        const content = readFileSync(path, 'utf8');
        if (!/^## 组件标识\s*$/m.test(content)) continue;
        const doc = describeDocument(content, path.split(/[\\/]/).at(-1));
        const definition = files.find(p => dirname(p) === dirname(path) && /Definition\.tsx?$/.test(p));
        if (!definition || !readFileSync(definition, 'utf8').includes(`compKey: "${doc.componentType}"`)
            && !readFileSync(definition, 'utf8').includes(`compKey: '${doc.componentType}'`))
            throw new Error(`组件类型与 Definition 不一致：${path}`);
        if (documents.some(d => d.componentType === doc.componentType)) throw new Error(`组件文档类型重复：${doc.componentType}`);
        const implementation = files.filter(p => p.startsWith(dirname(path) + sep) && /\.(tsx?|json|less|css)$/.test(p)).sort();
        const componentVersion = sha256(implementation.map(p => `${p.slice(sourceRoot.length).replaceAll('\\', '/')}\0${sha256(readFileSync(p))}`).join('\0'));
        documents.push({...doc, content, componentVersion});
    }
    // 向 Agent 开放的注册组件必须有规格；其余组件可以只有选择章节。
    for (const path of files.filter(p => /Definition\.tsx?$/.test(p))) {
        const type = /compKey:\s*["']([^"']+)["']/.exec(readFileSync(path, 'utf8'))?.[1];
        if (type && !excluded.has(type)
            && !documents.some(d => d.componentType === type && (d.hasFullSpec || d.componentInfo.selectable === false)))
            throw new Error(`开放组件缺少完整规格：${type}`);
    }
    documents.sort((a, b) => a.componentType < b.componentType ? -1 : 1);
    const fragments = commonFragments(readFileSync(fragmentFile, 'utf8'));
    for (const doc of documents) for (const ref of doc.fragmentRefs)
        if (!Object.hasOwn(fragments, ref)) throw new Error(`缺少公共片段：${doc.componentType} ${ref}`);
    const version = sha256(JSON.stringify(documents.map(d => [d.componentType, d.sha256, d.componentVersion])) + JSON.stringify(fragments));
    const base = join(outputRoot, 'builtin', version), fragmentIndex = {};
    for (const [label, content] of Object.entries(fragments)) {
        const path = `common/${label.slice(1, -1)}.json`;
        atomicWrite(join(base, path), content);
        fragmentIndex[label] = {path, sha256: sha256(content), bytes: Buffer.byteLength(content)};
    }
    const entries = documents.map(({content, ...doc}) => {
        const path = `components/${doc.componentType}/${doc.componentType}.md`;
        atomicWrite(join(base, path), content);
        return {...doc, path, source: 'builtin', corpusVersion: version};
    });
    const index = {schemaVersion: 'component-document-index/v1', corpusVersion: version, documents: entries, fragments: fragmentIndex};
    const indexText = JSON.stringify(index, null, 2) + '\n';
    if (Buffer.byteLength(indexText) > 2 * 1024 * 1024) throw new Error('组件索引超过 2 MiB 上限');
    atomicWrite(join(base, 'index.json'), indexText);
    // 最后切换指针，读者只会看到已经写完的不可变版本。
    atomicWrite(join(outputRoot, 'current.json'), JSON.stringify({corpusVersion: version}) + '\n');
    atomicWrite(summaryFile, JSON.stringify({corpusVersion: version, documents: entries.map(({sections, fragmentRefs, ...doc}) => doc)}, null, 2) + '\n');
    return index;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const index = generateComponentDocs();
    process.stdout.write(`组件资料已生成：${index.documents.length} 份，${docsRoot}\n`);
}
