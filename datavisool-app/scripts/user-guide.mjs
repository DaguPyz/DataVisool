/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import GithubSlugger from 'github-slugger';
import {remark} from 'remark';
import remarkGfm from 'remark-gfm';

const root = fileURLToPath(new URL('../../docs/zh-cn/', import.meta.url));
const prefix = 'virtual:user-guide/';
const parser = remark().use(remarkGfm);
const isExternal = url => /^(?:[a-z][a-z\d+.\-]*:|\/\/)/i.test(url);
const quote = JSON.stringify;

function nodeText(node) {
    if (node.type === 'image') return node.alt || '';
    if (typeof node.value === 'string') return node.value;
    const inline = ['paragraph', 'heading', 'emphasis', 'strong', 'delete', 'link', 'linkReference'].includes(node.type);
    return (node.children || []).map(nodeText).join(inline ? '' : ' ');
}

function readArticle(meta) {
    const source = fs.readFileSync(path.join(root, meta.sourcePath), 'utf8');
    const markdown = source;
    const tree = parser.parse(markdown);
    const slugger = new GithubSlugger();
    const headings = [];
    const sections = [{text: ''}];
    const images = new Set();
    const links = new Set();
    const definitions = new Map(tree.children.filter(n => n.type === 'definition').map(n => [n.identifier, n.url]));
    function references(node) {
        const url = node.url ?? definitions.get(node.identifier);
        if (url && !isExternal(url)) {
            if (node.type === 'image' || node.type === 'imageReference') images.add(url);
            if (node.type === 'link' || node.type === 'linkReference') links.add(url);
        }
        node.children?.forEach(references);
    }
    references(tree);

    let title;
    let titleLine;
    let titleId;
    for (const node of tree.children) {
        const text = nodeText(node).trim();
        if (node.type === 'heading') {
            const id = slugger.slug(text);
            if (node.depth === 1 && !title) {
                title = text;
                titleLine = node.position.start.line;
                titleId = id;
                continue;
            }
            headings.push({id, text, level: node.depth, line: node.position.start.line});
            sections.push({headingText: text, headingId: id, text: ''});
        } else if (text && node.type !== 'definition') {
            const section = sections[sections.length - 1];
            section.text = [section.text, text].filter(Boolean).join(' ');
        }
    }
    if (!title) throw new Error(meta.sourcePath + ' 缺少一级标题');
    return {meta, markdown, title, titleLine, titleId, headings, sections, images, links};
}

function targetPath(sourcePath, url) {
    const decoded = decodeURI(url).normalize('NFC');
    return path.posix.normalize(decoded.startsWith('/')
        ? decoded.replace(/^\/docs\/zh-cn(?:\/|$)|^\//, '')
        : path.posix.join(path.posix.dirname(sourcePath), decoded));
}

function createGuide() {
    const nav = JSON.parse(fs.readFileSync(path.join(root, 'navigation.json'), 'utf8'));
    const entries = nav.articles.map(readArticle);
    const byId = new Map(entries.map(a => [a.meta.id, a]));
    const bySource = new Map(entries.map(a => [a.meta.sourcePath, a]));
    const byRoute = new Map(entries.map(a => [a.meta.path, a]));
    byRoute.set('/docs', byId.get('index'));
    if (byId.size !== entries.length || bySource.size !== entries.length) throw new Error('文档目录包含重复的页面');
    const modules = new Map();
    for (const article of entries) {
        const {meta, title, markdown, headings, titleLine, titleId} = article;
        const imports = [];
        const images = [];
        for (const url of article.images) {
            const file = path.resolve(root, targetPath(meta.sourcePath, url));
            if (!file.startsWith(root) || !fs.statSync(file, {throwIfNoEntry: false})?.isFile())
                throw new Error(meta.sourcePath + ' 引用了不存在的图片 ' + url);
            const name = 'img' + images.length;
            imports.push('import ' + name + ' from ' + quote(file + '?url&no-inline'));
            images.push(quote(decodeURI(url)) + ': ' + name);
        }
        const links = {};
        for (const url of article.links) {
            const [, pathname, query, fragment] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
            const key = pathname ? targetPath(meta.sourcePath, pathname) : meta.sourcePath;
            const target = byRoute.get(decodeURI(pathname)) || bySource.get(key) || bySource.get(key + '.md') || byId.get(key) ||
                (key === '.' ? byId.get('index') : undefined);
            if (!target) throw new Error(meta.sourcePath + ' 引用了未登记的页面 ' + url);
            if (fragment && ![target.titleId, ...target.headings.map(h => h.id)].includes(decodeURIComponent(fragment.slice(1))))
                throw new Error(meta.sourcePath + ' 引用了不存在的章节 ' + url);
            links[decodeURI(url)] = target.meta.path + (query ?? '') + (fragment ?? '');
        }
        const data = {...meta, title, markdown, headings, titleLine, titleId, links};
        modules.set(meta.id, imports.join('\n') + '\nexport default {...' + quote(data) + ', images: {' + images.join(',') + '}}');
    }
    const index = entries.map(({meta, title, sections}) => ({
        id: meta.id, title, navTitle: meta.title, path: meta.path, sections,
    }));
    return {modules, index};
}

/** Build the article graph from published Markdown. Vite fingerprints the images each page actually uses. */
export default function userGuidePlugin() {
    let guide;
    return {
        name: 'datavisool-user-guide',
        resolveId(id) {
            if (id.startsWith(prefix)) return '\0' + id;
        },
        load(id) {
            if (!id.startsWith('\0' + prefix)) return;
            guide ??= createGuide();
            const key = id.slice(prefix.length + 1);
            if (key === 'catalog') {
                const loaders = [...guide.modules.keys()].map(id =>
                    quote(id) + ': () => import(' + quote(prefix + 'articles/' + id) + ').then(m => m.default)');
                return 'export default {' + loaders.join(',\n') + '}';
            }
            if (key === 'search-index') return 'export default ' + quote(guide.index);
            if (key.startsWith('articles/')) return guide.modules.get(key.slice('articles/'.length));
        },
        configureServer(server) {
            server.watcher.add(root);
            const invalidate = (_event, file) => {
                if (!file.startsWith(root)) return;
                guide = undefined;
                for (const mod of server.moduleGraph.idToModuleMap.values()) {
                    if (mod.id?.startsWith('\0' + prefix)) server.moduleGraph.invalidateModule(mod);
                }
                server.ws.send({type: 'full-reload'});
            };
            server.watcher.on('all', invalidate);
            server.httpServer?.once('close', () => server.watcher.off('all', invalidate));
        },
    };
}
