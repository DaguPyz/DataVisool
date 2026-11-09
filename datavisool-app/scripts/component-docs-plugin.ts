/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {Plugin} from 'vite';
import {generateComponentDocs, appRoot} from './component-docs.mjs';

/** 开发与发布共用生成规则；正文仅输出到后端资料目录。 */
export default function componentDocsPlugin(): Plugin {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
        name: 'component-document-files',
        configResolved() { generateComponentDocs(); },
        configureServer(server) {
            const changed = (path: string) => {
                const normalized = path.replace(/\\/g, '/');
                if (!normalized.startsWith(`${appRoot.replace(/\\/g, '/')}/src/comps/`) && !normalized.endsWith('G2Plot公共配置分块说明.md')) return;
                if (!/\.(md|tsx?|json|less|css)$/.test(path)) return;
                clearTimeout(timer);
                timer = setTimeout(() => {
                    try { generateComponentDocs(); }
                    catch (error) { server.config.logger.error(String(error));
                        server.ws.send({type: 'error', err: {message: String(error), stack: ''}}); }
                }, 100);
            };
            server.watcher.on('add', changed).on('change', changed).on('unlink', changed);
            server.httpServer?.once('close', () => {clearTimeout(timer);
                server.watcher.off('add', changed).off('change', changed).off('unlink', changed);});
        },
    };
}
