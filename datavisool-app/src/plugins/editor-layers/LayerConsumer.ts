/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorCanvasService, EditorLayerDomain} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorLayersState} from './EditorLayersState.ts';

export type LayerCanvas = Pick<EditorCanvasService,
    'readSelection' | 'select' | 'insertLayer' | 'focus' | 'closeContextMenu' | 'isSceneActive'>;

/** Keeps mounted views readable while stop preparation blocks their writes. */
export function createLayerConsumer(canvas: EditorCanvasService, state: EditorLayersState) {
    const lifetime = new AbortController();
    const accepting = () => !lifetime.signal.aborted && state.isAccepting();
    const viewCanvas: LayerCanvas = {
        readSelection: canvas.readSelection,
        select(...args) { if (accepting()) canvas.select(...args); },
        insertLayer(...args) { if (accepting()) canvas.insertLayer(...args); },
        focus() { if (accepting()) canvas.focus(); },
        closeContextMenu() { if (accepting()) canvas.closeContextMenu(); },
        isSceneActive(version) { return accepting() && canvas.isSceneActive(version); },
    };
    const prepareLayerDomain = (signal?: AbortSignal): Promise<EditorLayerDomain> => {
        if (!accepting() || signal?.aborted)
            return Promise.reject(new DOMException('图层面板已暂停或停止。', 'AbortError'));
        const consumer = new AbortController();
        const abort = () => consumer.abort();
        const cleanup = () => {
            lifetime.signal.removeEventListener('abort', abort);
            signal?.removeEventListener('abort', abort);
        };
        lifetime.signal.addEventListener('abort', abort, {once: true});
        signal?.addEventListener('abort', abort, {once: true});
        consumer.signal.addEventListener('abort', cleanup, {once: true});
        if (lifetime.signal.aborted || signal?.aborted) abort();
        return canvas.prepareLayerDomain(consumer.signal).then(domain => {
            if (consumer.signal.aborted || !domain.isActive())
                throw new DOMException('图层场景已切换或消费者已停止。', 'AbortError');
            const canWrite = () => accepting() && !consumer.signal.aborted && domain.isActive();
            return Object.freeze({
                ...domain,
                isActive: () => !consumer.signal.aborted && domain.isActive(),
                rename: (id: string, name: string) => canWrite() && domain.rename(id, name),
                setHidden: (id: string, hidden: boolean) => canWrite() && domain.setHidden(id, hidden),
                setLocked: (id: string, locked: boolean) => canWrite() && domain.setLocked(id, locked),
                reorder: (source: string, target: string, position: 'before' | 'after') =>
                    canWrite() && domain.reorder(source, target, position),
            });
        }).catch(error => { cleanup(); throw error; });
    };
    return {canvas: viewCanvas, prepareLayerDomain, dispose: () => lifetime.abort()};
}
