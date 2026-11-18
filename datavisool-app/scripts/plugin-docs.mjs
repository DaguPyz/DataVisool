/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createPluginList} from '../src/visloom/PluginList.ts';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const configFile = path.join(appRoot, 'tsconfig.json');
const startupFile = path.join(appRoot, 'src/bootstrap/appPlugins.ts');
const pluginContractFile = path.join(appRoot, 'src/visloom/contracts/Plugin.ts');
const serviceContractFile = path.join(appRoot, 'src/visloom/contracts/index.ts');
const appContracts = path.join(appRoot, 'src/contracts');
const publicDirectories = ['src/contracts', 'src/visloom/contracts'].map(dir => path.join(appRoot, dir) + path.sep);
export const pluginOutlineFile = fileURLToPath(new URL('../../datavisool-doc/一切皆插件改造大纲.md', import.meta.url));

const topic = 'develop/plugins';
const articlePath = id => '/docs/zh-cn/' + id;
const inline = value => '`' + value + '`';
const link = (title, id) => '[' + title + '](' + articlePath(id) + ')';
const code = source => ['```ts', source, '```'].join('\n');
const list = values => values.join('、') || '—';
const row = (...cells) => '| ' + cells.join(' | ') + ' |';

function fail(node, message) {
    const source = node?.getSourceFile();
    const line = source && source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const location = source ? path.relative(appRoot, source.fileName) + ':' + line : '插件清单';
    throw new Error(location + ' 无法生成插件文档。' + message);
}

function read(node, isExpected, expected) {
    while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) {
        node = node.expression;
    }
    if (!node || !isExpected(node)) fail(node, '需要' + expected + '。');
    return node;
}

function declaration(checker, name) {
    let symbol = checker.getSymbolAtLocation(name);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
}

function returned(factory) {
    const returns = factory.body?.statements.filter(ts.isReturnStatement);
    if (returns?.length !== 1) fail(factory, '需要一个静态返回声明。');
    return returns[0].expression;
}

function property(node, name) {
    const object = read(node, ts.isObjectLiteralExpression, '对象声明');
    const property = object.properties.find(prop => ts.isPropertyAssignment(prop)
        && (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) && prop.name.text === name);
    if (!property) fail(object, '缺少 ' + name + '。');
    return property.initializer;
}

const literal = node => read(node, ts.isStringLiteralLike, '字符串字面量').text;
const array = node => read(node, ts.isArrayLiteralExpression, '数组声明').elements;
const hasTag = (node, tag) => ts.getJSDocTags(node).some(doc => doc.tagName.text === tag);

function compileSources() {
    const config = ts.getParsedCommandLineOfConfigFile(configFile, {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic(diagnostic) {
            throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
    });
    if (config.errors.length) {
        throw new Error(config.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
    }
    return ts.createProgram([startupFile, ...ts.sys.readDirectory(appContracts, ['.ts'])], config.options);
}

function collectTypes(checker, roots, watchFiles, factoryFile) {
    const collected = new Set();

    function visit(node) {
        if (ts.isTypeReferenceNode(node)) {
            const type = declaration(checker, node.typeName);
            if (type && (ts.isInterfaceDeclaration(type) || ts.isTypeAliasDeclaration(type) || ts.isEnumDeclaration(type))) {
                const file = type.getSourceFile().fileName;
                if ((file === factoryFile || publicDirectories.some(dir => file.startsWith(dir))) && !collected.has(type)) {
                    collected.add(type);
                    watchFiles.add(file);
                    visit(type);
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    for (const root of roots) if (root) visit(root);
    return [...collected].map(type => type.getText()).join('\n\n');
}

function publicRoutes(factory) {
    return factory.getSourceFile().statements
        .filter(statement => ts.isVariableStatement(statement) && hasTag(statement, 'publicRoutes'))
        .flatMap(statement => statement.declarationList.declarations.flatMap(routeList => [...array(routeList.initializer)]))
        .map(route => ({id: literal(property(route, 'id')), path: literal(property(route, 'path'))}));
}

function readOutlineSection(source, heading) {
    const lines = source.split(/\r?\n/);
    const start = lines.indexOf(heading);
    if (start < 0) throw new Error('插件改造大纲缺少章节 ' + heading);
    const level = heading.indexOf(' ');
    const end = lines.findIndex((line, index) => index > start && /^#{1,6} /.test(line) && line.indexOf(' ') <= level);
    return lines.slice(start + 1, end < 0 ? undefined : end)
        .join('\n').replace(/\[[^\]\n]+\]\(\/Users\/[^)\n]+\)/g, '').trim();
}

function makeArticle(id, title, depth, sections) {
    return {
        meta: {id, title, path: articlePath(id), sourcePath: id + '.md', depth},
        markdown: ['# ' + title, ...sections].join('\n\n') + '\n',
    };
}

/** Read the declarations used at startup and validate them with the kernel's dependency checks. */
export function createPluginDocArticles() {
    const program = compileSources();
    const checker = program.getTypeChecker();
    const startup = program.getSourceFile(startupFile);
    const watchFiles = new Set([startupFile, configFile, pluginContractFile, serviceContractFile, pluginOutlineFile]);
    const createAppPlugins = startup.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createAppPlugins');
    if (!createAppPlugins) fail(startup, '缺少 createAppPlugins。');
    const serviceContract = program.getSourceFile(serviceContractFile)?.statements
        .find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'PluginServices');
    if (!serviceContract) throw new Error('缺少 Visloom 的 PluginServices 公开接口。');
    const services = checker.getTypeAtLocation(serviceContract);

    function readService(reference) {
        const name = literal(reference);
        const member = services.getProperty(name)?.valueDeclaration;
        if (!member || !ts.isPropertySignature(member) || !member.type) {
            fail(reference, 'PluginServices 缺少能力类型 ' + name + '。');
        }
        const file = member.getSourceFile().fileName;
        watchFiles.add(file);
        return {name, file, type: member.type};
    }

    const descriptors = array(returned(createAppPlugins)).map(expression => {
        const call = read(expression, ts.isCallExpression, '插件工厂调用');
        const factory = read(declaration(checker, call.expression), ts.isFunctionDeclaration, '插件工厂声明');
        const spec = returned(factory);
        watchFiles.add(factory.getSourceFile().fileName);
        return {
            factory,
            id: literal(property(spec, 'id')),
            requires: array(property(spec, 'requires')).map(readService),
            provides: array(property(spec, 'provides')).map(readService),
        };
    });
    const pluginList = createPluginList(descriptors.map(({id, requires, provides}) => ({
        id,
        requires: requires.map(service => service.name),
        provides: provides.map(service => service.name),
        activate() {},
    })));

    const providers = new Map();
    for (const plugin of pluginList) {
        for (const name of plugin.provides) providers.set(name, plugin.id);
    }
    const pilot = new Map(descriptors.filter(({factory}) => hasTag(factory, 'pluginDocs')).map(spec => [spec.id, spec]));
    const overviewRows = pluginList.map(plugin => row(
        pilot.has(plugin.id) ? link(inline(plugin.id), topic + '/' + plugin.id) : inline(plugin.id),
        list([...plugin.requires].map(inline)),
        list([...plugin.provides].map(inline)),
    ));
    const overview = makeArticle(topic, '插件开发', 0, [
        '下表列出当前默认装配的 ' + pluginList.length + ' 个插件，按 Visloom 校验后的启动顺序排列。带链接的条目提供替换说明。',
        '## 默认启用的插件',
        [row('插件 ID', '依赖的能力', '提供的能力'), row('---', '---', '---'), ...overviewRows].join('\n'),
        '## 实现插件',
        link('查看插件设计规范', topic + '/design'),
    ]);

    const outline = readFileSync(pluginOutlineFile, 'utf8');
    const pluginContract = program.getSourceFile(pluginContractFile).statements
        .find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'Plugin');
    if (!pluginContract) throw new Error('缺少 Visloom 的 Plugin 公开接口。');
    const design = makeArticle(topic + '/design', '插件设计规范', 1, [
        '## 插件声明',
        code(pluginContract.getText()),
        '## 内容边界',
        readOutlineSection(outline, '# 二、插件的内容边界'),
        '## 停用清理',
        readOutlineSection(outline, '## 1.5 停用清理'),
    ]);

    const details = [...pilot.values()].map(({id, factory, requires, provides}) => {
        const summary = ts.displayPartsToString(checker.getSymbolAtLocation(factory.name).getDocumentationComment(checker));
        const type = checker.getSignatureFromDeclaration(factory);
        const signature = 'function ' + factory.name.getText() + checker.signatureToString(type, factory) + ';';
        const factoryTypes = collectTypes(checker, factory.parameters.map(parameter => parameter.type), watchFiles, factory.getSourceFile().fileName);
        const relationships = [
            ...requires.map(({name}) => row('依赖', inline(name), inline(providers.get(name)))),
            ...provides.map(({name}) => row('提供', inline(name),
                list(pluginList.filter(plugin => plugin.requires.has(name)).map(plugin => inline(plugin.id))),
            )),
        ];
        const views = ['## 工厂签名', code([signature, factoryTypes].filter(Boolean).join('\n\n'))];
        const routes = publicRoutes(factory);
        if (routes.length) {
            views.unshift('## 公开路由', [
                row('路由 ID', '访问路径'), row('---', '---'), ...routes.map(route => row(inline(route.id), inline(route.path))),
            ].join('\n'));
        }
        for (const [heading, capabilities] of [['提供的接口', provides], ['依赖的接口', requires]]) {
            if (!capabilities.length) continue;
            views.push('## ' + heading);
            for (const {name, file, type} of capabilities) {
                views.push('### ' + inline(name));
                views.push('上下文属性 ' + inline('ctx.' + name) + ' · ' + inline(path.relative(appRoot, file)));
                views.push(code(collectTypes(checker, [type], watchFiles) || type.getText()));
            }
        }
        const capabilityTable = relationships.length ? [
            '## 能力与关联插件',
            [row('关系', '能力', '关联插件'), row('---', '---', '---'), ...relationships].join('\n'),
        ] : [];
        return makeArticle(topic + '/' + id, id, 1, [
            summary,
            ...capabilityTable,
            ...views,
            '## 设计规范',
            link('查看统一的插件规范', topic + '/design'),
        ]);
    });

    return {articles: [overview, design, ...details], watchFiles};
}
