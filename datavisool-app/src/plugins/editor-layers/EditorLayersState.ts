/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorCanvasService, EditorLayerNode, EditorLayerUiEvent} from '@datavisool/sdk/plugin/contracts/editorCanvas';

export interface LayerSelectionModifiers {
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
}

export interface LayerDragSession {
    readonly sourceId: string;
    readonly sourceRow: HTMLElement;
    overRow?: HTMLElement;
    dropPosition?: 'before' | 'after';
}

const flattenTree = (layers: readonly EditorLayerNode[]): EditorLayerNode[] => {
    const result: EditorLayerNode[] = [];
    const walk = (items: readonly EditorLayerNode[]) => items.forEach(item => {
        result.push(item);
        if (item.children) walk(item.children);
    });
    walk(layers);
    return result;
};

/** UI-only state owned by one editor-layers plugin activation. */
export class EditorLayersState {
    private listeners = new Set<() => void>();
    private rows = new Map<string, HTMLElement>();
    private dragSession: LayerDragSession | null = null;
    private expandedGroupIds = new Set<string>();
    private timers = new Set<number>();
    private frames = new Set<number>();
    private searchFrames = new Set<number>();
    private snapshotVersion = 0;
    private sceneVersion: number | undefined;
    private sceneEpoch = 0;
    private selectionAnchorId: string | null = null;
    private layersViewMounted = false;
    private layersContainer: HTMLElement | null = null;
    private pendingRevealTarget: string | undefined;
    private disposed = false;
    private paused = false;
    private interactions = new Set<() => void>();
    searchOpen = false;
    searchKeyword = '';

    readonly subscribe = (listener: () => void) => {
        if (this.disposed) return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    readonly getSnapshot = () => this.snapshotVersion;

    readonly isAccepting = () => !this.disposed && !this.paused;

    readonly blockInteractionIfPaused = (event: {preventDefault(): void; stopPropagation(): void}) => {
        if (this.isAccepting()) return;
        event.preventDefault();
        event.stopPropagation();
    };

    ownInteraction = (cleanup: () => void) => {
        if (this.disposed) { cleanup(); return () => {}; }
        this.interactions.add(cleanup);
        return () => { this.interactions.delete(cleanup); };
    };

    private cancelInteractions = () => {
        const errors: unknown[] = [];
        [...this.interactions].reverse().forEach(cleanup => {
            try { cleanup(); } catch (error) { errors.push(error); }
        });
        if (errors.length) throw new AggregateError(errors, '清理图层交互失败。');
    };

    pause = () => {
        if (!this.isAccepting()) return;
        this.paused = true;
        this.clearScheduledWork();
        try { this.cancelInteractions(); }
        finally { this.dragSession = null; this.notify(); }
    };

    resume = () => {
        if (this.disposed || !this.paused) return;
        this.paused = false;
        this.notify();
    };

    readSceneEpoch = () => this.sceneEpoch;

    readSceneVersion = () => this.sceneVersion;

    isGroupExpanded = (id: string) => this.expandedGroupIds.has(id);

    readDragSession = () => this.dragSession;

    setDragSession = (session: LayerDragSession | null) => { if (!session || this.isAccepting()) this.dragSession = session; };

    private notify = () => {
        if (this.disposed) return;
        this.snapshotVersion++;
        this.listeners.forEach(listener => listener());
    };

    private clearScheduledWork = () => {
        this.timers.forEach(timer => window.clearTimeout(timer));
        this.frames.forEach(frame => window.cancelAnimationFrame(frame));
        this.timers.clear();
        this.frames.clear();
        this.searchFrames.clear();
        this.pendingRevealTarget = undefined;
    };

    resetScene = () => {
        this.clearScheduledWork();
        this.sceneVersion = undefined;
        this.sceneEpoch++;
        this.selectionAnchorId = null;
        this.expandedGroupIds.clear();
        this.rows.clear();
        this.dragSession = null;
        this.searchOpen = false;
        this.searchKeyword = '';
        this.notify();
    };

    setScene = (sceneVersion: number) => {
        if (this.sceneVersion === sceneVersion) return;
        this.clearScheduledWork();
        this.sceneVersion = sceneVersion;
        this.selectionAnchorId = null;
        this.expandedGroupIds.clear();
        this.rows.clear();
        this.dragSession = null;
        this.notify();
    };

    toggleSearch = () => this.setSearchOpen(!this.searchOpen);

    setSearchOpen = (open: boolean) => {
        if (!this.isAccepting()) return;
        if (this.searchOpen === open) return;
        this.searchOpen = open;
        if (!open) {
            this.searchKeyword = '';
            this.cancelSearchFrames();
        }
        this.notify();
    };

    setSearchKeyword = (keyword: string) => {
        if (!this.isAccepting()) return;
        if (this.searchKeyword === keyword) return;
        this.searchKeyword = keyword;
        this.notify();
    };

    refresh = () => { if (this.isAccepting()) this.notify(); };

    toggleGroup = (id: string) => {
        if (!this.isAccepting()) return;
        if (this.expandedGroupIds.has(id)) this.expandedGroupIds.delete(id);
        else this.expandedGroupIds.add(id);
        this.notify();
    };

    toggleAllGroups = (groupIds: readonly string[], unfold: boolean) => {
        if (!this.isAccepting()) return;
        groupIds.forEach(id => unfold ? this.expandedGroupIds.add(id) : this.expandedGroupIds.delete(id));
        this.notify();
    };

    acceptUiEvent = (event: EditorLayerUiEvent) => {
        if (!this.isAccepting() || this.sceneVersion === undefined || event.sceneVersion !== this.sceneVersion) return;
        if (event.kind === 'refresh') {
            this.notify();
            return;
        }
        if (!this.layersViewMounted) return;
        if (event.kind === 'unfold') {
            this.toggleAllGroups(event.groupIds, event.unfold);
            return;
        }
        event.unfoldIds.forEach(id => this.expandedGroupIds.add(id));
        this.pendingRevealTarget = event.targetId;
        this.notify();
        this.scheduleFrame(() => this.scrollToPendingReveal());
    };

    mountLayersView = (container: HTMLElement | null) => {
        this.layersViewMounted = true;
        this.layersContainer = container;
        return () => {
            this.layersViewMounted = false;
            this.layersContainer = null;
            this.rows.clear();
            this.pendingRevealTarget = undefined;
        };
    };

    registerRow = (id: string, element: HTMLElement | null) => {
        if (element) this.rows.set(id, element);
        else this.rows.delete(id);
        if (element && id === this.pendingRevealTarget) this.scheduleFrame(() => this.scrollToPendingReveal());
    };

    scheduleTimeout = (callback: () => void, delayMs: number) => {
        if (!this.isAccepting()) return;
        const expectedVersion = this.sceneVersion;
        const timer = window.setTimeout(() => {
            this.timers.delete(timer);
            if (this.isAccepting() && this.sceneVersion === expectedVersion) callback();
        }, delayMs);
        this.timers.add(timer);
        return timer;
    };

    cancelTimeout = (timer: number | undefined) => {
        if (timer === undefined) return;
        window.clearTimeout(timer);
        this.timers.delete(timer);
    };

    scheduleFrame = (callback: () => void) => {
        if (!this.isAccepting()) return;
        const expectedVersion = this.sceneVersion;
        const frame = window.requestAnimationFrame(() => {
            this.frames.delete(frame);
            if (this.isAccepting() && this.sceneVersion === expectedVersion) callback();
        });
        this.frames.add(frame);
        return frame;
    };

    scheduleSearchFrame = (callback: () => void) => {
        if (!this.isAccepting()) return;
        const expectedVersion = this.sceneVersion;
        const frame = window.requestAnimationFrame(() => {
            this.frames.delete(frame);
            this.searchFrames.delete(frame);
            if (this.isAccepting() && this.searchOpen && this.sceneVersion === expectedVersion) callback();
        });
        this.frames.add(frame);
        this.searchFrames.add(frame);
        return frame;
    };

    cancelSearchFrames = () => {
        this.searchFrames.forEach(frame => {
            window.cancelAnimationFrame(frame);
            this.frames.delete(frame);
        });
        this.searchFrames.clear();
    };

    cancelFrame = (frame: number | undefined) => {
        if (frame === undefined) return;
        window.cancelAnimationFrame(frame);
        this.frames.delete(frame);
    };

    selectLayer = (
        id: string,
        event: LayerSelectionModifiers,
        canvas: Pick<EditorCanvasService, 'readSelection' | 'select'>,
        layers: readonly EditorLayerNode[],
    ) => {
        if (!this.isAccepting()) return;
        const currentIds = canvas.readSelection().ids;
        const interaction = {kind: 'layer-row', id} as const;
        let nextIds: string[] = [];
        if (event.ctrlKey || event.metaKey) {
            nextIds = currentIds.includes(id) ? currentIds.filter(currentId => currentId !== id) : [...currentIds, id];
        } else if (event.shiftKey) {
            const flattened = flattenTree(layers);
            const ids = flattened.map(layer => layer.id).filter((value): value is string => Boolean(value));
            const rememberedIndex = this.selectionAnchorId ? ids.indexOf(this.selectionAnchorId) : -1;
            const currentAnchorId = currentIds[currentIds.length - 1];
            const currentIndex = currentAnchorId ? ids.indexOf(currentAnchorId) : -1;
            const targetIndex = ids.indexOf(id);
            const anchorIndex = rememberedIndex >= 0 ? rememberedIndex : currentIndex >= 0 ? currentIndex : targetIndex;
            nextIds = anchorIndex >= 0 && targetIndex >= 0
                ? ids.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
                : [id];
        } else {
            nextIds = [id];
        }
        if (!event.shiftKey) this.selectionAnchorId = id;
        canvas.select([...new Set(nextIds)], 'layer-list', interaction);
    };

    dispose = () => {
        if (this.disposed) return;
        this.disposed = true;
        this.clearScheduledWork();
        let interactionError: unknown;
        try { this.cancelInteractions(); } catch (error) { interactionError = error; }
        this.interactions.clear();
        this.listeners.clear();
        this.rows.clear();
        this.dragSession = null;
        this.expandedGroupIds.clear();
        this.layersContainer = null;
        this.layersViewMounted = false;
        this.selectionAnchorId = null;
        this.sceneVersion = undefined;
        this.searchOpen = false;
        this.searchKeyword = '';
        if (interactionError) throw interactionError;
    };

    private scrollToPendingReveal = () => {
        const targetId = this.pendingRevealTarget;
        const row = targetId ? this.rows.get(targetId) : undefined;
        const container = this.layersContainer;
        if (!row || !container) return;
        const offset = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
        if (offset < 0 || offset > container.clientHeight) container.scrollTop += offset - 300;
        this.pendingRevealTarget = undefined;
    };
}
