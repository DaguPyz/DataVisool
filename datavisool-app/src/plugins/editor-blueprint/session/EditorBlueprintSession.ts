/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {action, makeObservable, observable, runInAction} from 'mobx';
import {cloneDeep, isEqual} from 'lodash';
import {IdGenerate} from '@datavisool/sdk';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {
    DesignerBlueprintChangeEvent,
    DesignerBlueprintPage,
    DesignerBlueprintSnapshot,
} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerProjectSession} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {BPNodeLayoutType, IBluePrintManager, IBPLine, IPoint, NodeInfoType} from '@datavisool/sdk/types';
import type {
    DesignerBlueprintNodeRegistry,
    EditorBlueprintNodeController,
} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import type {Application, Graphics} from 'pixi.js';
import {BPLeftStore} from '@/plugins/editor-blueprint/state/BPLeftStore.ts';
import {BPRightStore} from '@/plugins/editor-blueprint/state/BPRightStore.ts';
import {BPWorkspaceUIStore} from '@/plugins/editor-blueprint/state/BPWorkspaceUIStore.ts';
import {BlueprintContextMenuStore} from '@/plugins/editor-blueprint/state/BlueprintContextMenuStore.ts';
import {normalizeBlueprintNodeConfig} from '@/plugins/editor-blueprint/util/BlueprintNodeUIUtil.ts';
import BpCanvasUtil from '@/plugins/editor-blueprint/util/BpCanvasUtil.ts';
import type BPViewportController from '../workspace/BPViewportController.ts';

function rebuildAnchorIndexes(page: IBluePrintManager): void {
    const anchorMap: Record<string, string[]> = {};
    const lineMap: Record<string, string[]> = {};
    Object.values(page.bpLines ?? {}).forEach(line => {
        if (!line?.id || !line.startAnchorId || !line.endAnchorId) return;
        (anchorMap[line.startAnchorId] ??= []).push(line.endAnchorId);
        (lineMap[line.startAnchorId] ??= []).push(line.id);
        (lineMap[line.endAnchorId] ??= []).push(line.id);
    });
    page.bpAPMap = anchorMap;
    page.bpAPLineMap = lineMap;
}

function deleteNodeData(page: IBluePrintManager, ids: ReadonlySet<string>): void {
    for (const id of ids) {
        delete page.bpNodeLayoutMap?.[id];
        delete page.bpNodeConfigMap?.[id];
    }
    Object.keys(page.bpLines ?? {}).forEach(lineId => {
        const line = page.bpLines?.[lineId];
        const touches = (anchorId?: string) => !!anchorId && [...ids].some(id => anchorId.startsWith(`${id}:`));
        if (touches(line?.startAnchorId) || touches(line?.endAnchorId)) delete page.bpLines?.[lineId];
    });
    rebuildAnchorIndexes(page);
}

export interface EditorBlueprintSessionOptions {
    readonly scene: DesignerEditingScene;
    readonly project: DesignerProjectSession;
    readonly canvas: EditorCanvasService;
    readonly registry: DesignerBlueprintNodeRegistry;
}

/** Per-overlay editor state. Runtime scene data is read and written only through the scene contract. */
export class EditorBlueprintSession {
    readonly scene: DesignerEditingScene;
    readonly project: DesignerProjectSession;
    readonly canvas: EditorCanvasService;
    readonly registry: DesignerBlueprintNodeRegistry;
    readonly leftStore = new BPLeftStore();
    readonly rightStore = new BPRightStore();
    readonly workspaceUIStore = new BPWorkspaceUIStore();
    readonly contextMenu = new BlueprintContextMenuStore();

    private snapshotBox = observable.box<DesignerBlueprintSnapshot | undefined>(undefined, {deep: false});
    private controllersBox = observable.box<Record<string, EditorBlueprintNodeController>>({}, {deep: false});
    private controllerSubscriptions = new Map<string, () => void>();
    private syncingControllers = new Set<string>();
    private destroyedControllers = new WeakSet<EditorBlueprintNodeController>();
    private active = true;
    private paused = false;
    private readonly viewCleanups = new Set<() => void>();
    private lineFrame: number | undefined;

    currentPageId: string | null = null;
    selectedNodes: HTMLElement[] = [];
    selectedNodeIds: string[] = [];
    selectedLines: string[] = [];
    nodeContainerRef: HTMLDivElement | null = null;
    bpDragContentRef: HTMLDivElement | null = null;
    canvasOffset: IPoint = {x: 0, y: 0};
    canvasTranslate: IPoint = {x: 0, y: 0};
    canvasScale = 1;
    viewportController: BPViewportController | null = null;
    lineInstances: Record<string, Graphics> = {};
    pixiApp: Application | null = null;

    constructor({scene, project, canvas, registry}: EditorBlueprintSessionOptions) {
        if (!scene.isActive()) throw new Error('蓝图编辑场景已失效。');
        this.scene = scene;
        this.project = project;
        this.canvas = canvas;
        this.registry = registry;
        const initial = scene.blueprints.read();
        if (!initial || initial.sceneVersion !== scene.version) throw new Error('蓝图编辑场景尚未就绪。');
        this.snapshotBox.set(initial);
        this.currentPageId = initial.pages[0]?.pageId ?? null;
        this.refreshUsedNodes(initial.pages);
        makeObservable(this, {
            currentPageId: observable,
            selectedNodes: observable.ref,
            selectedNodeIds: observable.ref,
            selectedLines: observable.ref,
            nodeContainerRef: observable.ref,
            bpDragContentRef: observable.ref,
            canvasOffset: observable.ref,
            canvasTranslate: observable.ref,
            canvasScale: observable,
            viewportController: observable.ref,
            lineInstances: observable.ref,
            pixiApp: observable.ref,
            setCurrentPage: action,
            loadBpPageContent: action,
            setSelectedNodes: action,
            setSelectedNodeIds: action,
            setSelectedLines: action,
            setCanvasScale: action,
            setCanvasTranslate: action,
            setViewportController: action,
            resetCanvas: action,
            dispose: action,
        });
    }

    isActive = () => this.active && !this.paused && this.scene.isActive();

    pause() {
        this.paused = true;
        this.cancelLineRender();
    }
    resume() {
        if (!this.active || !this.scene.isActive()) return;
        this.paused = false;
        const snapshot = this.scene.blueprints.read();
        if (snapshot) this.replaceSnapshot(snapshot);
    }

    ownViewResource(cleanup: () => void): () => void {
        if (!this.active) { cleanup(); return () => undefined; }
        let owned = true;
        const release = () => {
            if (!owned) return;
            owned = false;
            this.viewCleanups.delete(release);
            cleanup();
        };
        this.viewCleanups.add(release);
        return release;
    }

    private cleanupAll(cleanups: readonly (() => void)[], message: string): void {
        const errors: unknown[] = [];
        for (const cleanup of cleanups) {
            try { cleanup(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, message);
    }

    get snapshot(): DesignerBlueprintSnapshot | undefined { return this.snapshotBox.get(); }
    get bpPageMangers(): readonly DesignerBlueprintPage[] { return this.snapshotBox.get()?.pages ?? []; }
    get currentPageManager(): DesignerBlueprintPage | null {
        return this.snapshotBox.get()?.pages.find(page => page.pageId === this.currentPageId) ?? null;
    }
    get currPageNodeControllers(): Record<string, EditorBlueprintNodeController> { return this.controllersBox.get(); }

    readLayerConfigs() {
        return this.scene.readLayerConfigs() ?? {};
    }

    readGlobalVariables() {
        return this.scene.variables.list();
    }

    refreshFromScene(event: DesignerBlueprintChangeEvent): void {
        if (!this.isActive() || event.sceneIdentity !== this.scene.identity || event.sceneVersion !== this.scene.version) return;
        const current = this.snapshotBox.get();
        if (current?.sceneVersion === event.sceneVersion && current.revision >= event.revision) return;
        const next = this.scene.blueprints.read();
        if (!next || next.sceneIdentity !== event.sceneIdentity
            || next.sceneVersion !== event.sceneVersion || next.revision < event.revision) return;
        this.replaceSnapshot(next);
    }

    private replaceSnapshot(next: DesignerBlueprintSnapshot): void {
        runInAction(() => {
            this.snapshotBox.set(next);
            if (!next.pages.some(page => page.pageId === this.currentPageId))
                this.currentPageId = next.pages[0]?.pageId ?? null;
        });
        this.refreshUsedNodes(next.pages);
        this.syncControllersFromModel([]);
        this.scheduleLineRender();
    }

    private refreshUsedNodes(pages: readonly IBluePrintManager[]): void {
        this.leftStore.resetUsedNodes();
        pages.forEach(page => Object.keys(page.bpNodeLayoutMap ?? {}).forEach(id => this.leftStore.setUsedNodes(id, true)));
    }

    private replacePages(pages: readonly DesignerBlueprintPage[], expected: DesignerBlueprintSnapshot, recordHistory: boolean): boolean {
        if (!this.isActive()) return false;
        const change = this.scene.blueprints.write(pages, expected);
        if (!change) return false;
        let recorded: boolean;
        try { recorded = !recordHistory || this.canvas.recordChange(change); }
        catch (error) {
            const reverted = change.rollback();
            const restored = this.scene.blueprints.read();
            if (restored) this.replaceSnapshot(restored);
            if (!reverted) throw new AggregateError([error], '登记蓝图历史失败，且原场景已无法回退。');
            throw error;
        }
        if (!recorded) {
            const reverted = change.rollback();
            const restored = this.scene.blueprints.read();
            if (restored) this.replaceSnapshot(restored);
            if (!reverted) throw new Error('登记蓝图历史失败，且原场景已无法回退。');
            return false;
        }
        const committed = this.scene.blueprints.read();
        if (committed) this.replaceSnapshot(committed);
        return true;
    }

    private updatePage(pageId: string, update: (page: IBluePrintManager) => void, recordHistory = true): boolean {
        const snapshot = this.snapshotBox.get();
        if (!this.isActive() || !snapshot) return false;
        const pages = cloneDeep([...snapshot.pages]);
        const page = pages.find(item => item.pageId === pageId);
        if (!page) return false;
        const before = cloneDeep(page);
        update(page);
        if (isEqual(before, page)) return false;
        return this.replacePages(pages, snapshot, recordHistory);
    }

    private updateCurrentPage(update: (page: IBluePrintManager) => void, recordHistory = true): boolean {
        const pageId = this.currentPageId;
        return pageId ? this.updatePage(pageId, update, recordHistory) : false;
    }

    private syncControllersFromModel(pageIds: readonly string[]): void {
        const page = this.currentPageManager;
        if (!page || (pageIds.length > 0 && !pageIds.includes(page.pageId ?? ''))) return;
        const layouts = page.bpNodeLayoutMap ?? {};
        for (const [id, controller] of Object.entries(this.currPageNodeControllers)) {
            const config = page.bpNodeConfigMap?.[id] as NodeInfoType | undefined;
            if (!layouts[id] || !config) {
                this.unregisterController(id, controller);
                continue;
            }
            if (this.syncingControllers.has(id) || isEqual(controller.getConfig(), config)) continue;
            this.syncingControllers.add(id);
            try { controller.update(cloneDeep(config)); }
            finally { this.syncingControllers.delete(id); }
        }
    }

    registerController(id: string, controller: EditorBlueprintNodeController): void {
        if (!this.isActive()) { this.destroyController(controller); return; }
        const pageId = this.currentPageId;
        if (!pageId) { this.destroyController(controller); return; }
        const previous = this.currPageNodeControllers[id];
        if (previous && previous !== controller) this.unregisterController(id, previous);
        runInAction(() => this.controllersBox.set({...this.currPageNodeControllers, [id]: controller}));
        const unsubscribe = controller.subscribe(() => {
            if (!this.isActive() || this.currentPageId !== pageId
                || this.currPageNodeControllers[id] !== controller
                || this.syncingControllers.has(id)) return;
            const config = normalizeBlueprintNodeConfig(controller.getConfig());
            const snapshot = this.snapshotBox.get();
            if (!snapshot || !config) return;
            this.updatePage(pageId, page => {
                page.bpNodeConfigMap ??= {};
                page.bpNodeConfigMap[id] = cloneDeep(config);
            }, false);
        });
        this.controllerSubscriptions.set(id, unsubscribe);
    }

    unregisterController(id: string, controller?: EditorBlueprintNodeController): void {
        const current = this.currPageNodeControllers[id];
        if (!current || (controller && current !== controller)) return;
        this.controllerSubscriptions.get(id)?.();
        this.controllerSubscriptions.delete(id);
        const next = {...this.currPageNodeControllers};
        delete next[id];
        runInAction(() => this.controllersBox.set(next));
        this.destroyController(current);
    }

    destroyController(controller: EditorBlueprintNodeController): void {
        if (this.destroyedControllers.has(controller)) return;
        this.destroyedControllers.add(controller);
        controller.destroy();
    }

    setControllerConfig(id: string, config: NodeInfoType): boolean {
        return this.updateCurrentPage(page => {
            page.bpNodeConfigMap ??= {};
            page.bpNodeConfigMap[id] = cloneDeep(config);
        }, false);
    }

    addBPNodeLayout(layout: BPNodeLayoutType): boolean {
        if (!this.isActive() || !layout.id) return false;
        const page = this.currentPageManager;
        if (!page || page.bpNodeLayoutMap[layout.id]) return false;
        let defaultConfig: NodeInfoType | null = null;
        if (layout.type) {
            const definition = this.registry.get(layout.type);
            if (definition) {
                const controller = definition.createController(undefined, this.scene.blueprintNodeMetadata);
                try {
                    defaultConfig = normalizeBlueprintNodeConfig(controller.getNodeInfo(layout.id));
                } finally {
                    this.destroyController(controller);
                }
            }
        }
        if (!defaultConfig) return false;
        return this.updateCurrentPage(page => {
            page.bpNodeLayoutMap ??= {};
            page.bpNodeLayoutMap[layout.id!] = cloneDeep(layout);
            page.bpNodeConfigMap ??= {};
            page.bpNodeConfigMap[layout.id!] = cloneDeep(defaultConfig!);
        });
    }

    updBpNodeLayout(layout: BPNodeLayoutType, recordHistory = true): boolean {
        if (!layout.id) return false;
        return this.updateCurrentPage(page => {
            const current = page.bpNodeLayoutMap?.[layout.id!];
            if (current) page.bpNodeLayoutMap![layout.id!] = {...current, ...cloneDeep(layout), position: {
                x: layout.position?.x ?? current.position?.x ?? 0,
                y: layout.position?.y ?? current.position?.y ?? 0,
            }};
        }, recordHistory);
    }

    addLine(line: IBPLine): boolean {
        if (!line.id) return false;
        return this.updateCurrentPage(page => {
            page.bpLines ??= {};
            page.bpLines[line.id!] = cloneDeep(line);
            rebuildAnchorIndexes(page);
        });
    }

    isRepeatLine(startAnchorId: string, endAnchorId: string): boolean {
        return Boolean(this.currentPageManager?.bpAPMap?.[startAnchorId]?.includes(endAnchorId));
    }

    updateLineGeometry(lines: readonly IBPLine[]): boolean {
        return this.updateCurrentPage(page => {
            page.bpLines ??= {};
            lines.forEach(line => {
                if (line.id && page.bpLines![line.id]) page.bpLines![line.id] = cloneDeep(line);
            });
        }, false);
    }

    moveNodes(nodes: readonly {id: string; x: number; y: number}[]): boolean {
        const snapshot = this.snapshotBox.get();
        const pageId = this.currentPageId;
        if (!snapshot || !pageId || !this.isActive() || nodes.length === 0) return false;
        const pages = cloneDeep([...snapshot.pages]);
        const page = pages.find(item => item.pageId === pageId);
        if (!page) return false;
        const moved = new Map(nodes.map(item => [item.id, item]));
        for (const {id, x, y} of nodes) {
            const layout = page.bpNodeLayoutMap?.[id];
            if (layout) layout.position = {x, y};
            const element = document.querySelector<HTMLElement>(`.bp-node-container[data-nid="${CSS.escape(id)}"]`);
            if (element) element.style.transform = `translate(${x}px, ${y}px)`;
        }
        Object.values(page.bpLines ?? {}).forEach(line => {
            const owner = (anchorId?: string) => anchorId?.split(':')[0] ?? '';
            if (!moved.has(owner(line.startAnchorId)) && !moved.has(owner(line.endAnchorId))) return;
            const start = line.startAnchorId ? document.getElementById(line.startAnchorId) : null;
            const end = line.endAnchorId ? document.getElementById(line.endAnchorId) : null;
            if (!start || !end) return;
            const startRect = start.getBoundingClientRect();
            const endRect = end.getBoundingClientRect();
            line.startPoint = {x: startRect.x + startRect.width / 2 - this.canvasOffset.x, y: startRect.y + startRect.height / 2 - this.canvasOffset.y};
            line.endPoint = {x: endRect.x + endRect.width / 2 - this.canvasOffset.x, y: endRect.y + endRect.height / 2 - this.canvasOffset.y};
            const factor = line.endPoint.x < line.startPoint.x ? 0.8 : 0.5;
            const width = Math.abs(line.endPoint.x - line.startPoint.x) * factor;
            line.firstCP = {x: line.startPoint.x + width, y: line.startPoint.y};
            line.secondCP = {x: line.endPoint.x - width, y: line.endPoint.y};
        });
        return this.replacePages(pages, snapshot, true);
    }

    delLine(ids: readonly string[]): boolean {
        const changed = this.updateCurrentPage(page => {
            ids.forEach(id => { delete page.bpLines?.[id]; });
            rebuildAnchorIndexes(page);
        });
        if (changed) {
            ids.forEach(id => {
                const graphic = this.lineInstances[id];
                graphic?.removeAllListeners(); graphic?.clear(); graphic?.destroy();
                delete this.lineInstances[id];
            });
            this.setSelectedLines([]);
        }
        return changed;
    }

    deleteSelection(): boolean {
        const nodeIds = [...this.selectedNodeIds];
        if (this.selectedNodes.length > 0) return this.delNode(nodeIds);
        return this.selectedLines.length > 0 ? this.delLine([...this.selectedLines]) : false;
    }

    delNode(ids: readonly string[], everyPage = false): boolean {
        const snapshot = this.snapshotBox.get();
        if (!this.isActive() || !snapshot || ids.length === 0) return false;
        const pages = cloneDeep([...snapshot.pages]);
        let changed = false;
        const removedLines = new Set<string>();
        pages.forEach(page => {
            if (!everyPage && page.pageId !== this.currentPageId) return;
            const before = cloneDeep(page);
            const pageIds = new Set(ids);
            Object.values(page.bpLines ?? {}).forEach(line => {
                const touches = (anchorId?: string) => !!anchorId && [...pageIds].some(id => anchorId.startsWith(`${id}:`));
                if (touches(line.startAnchorId) || touches(line.endAnchorId)) line.id && removedLines.add(line.id);
            });
            deleteNodeData(page, new Set(ids));
            changed ||= !isEqual(before, page);
        });
        if (!changed || !this.replacePages(pages, snapshot, true)) return false;
        removedLines.forEach(id => {
            const graphic = this.lineInstances[id];
            graphic?.removeAllListeners(); graphic?.clear(); graphic?.destroy();
            delete this.lineInstances[id];
        });
        ids.forEach(id => this.unregisterController(id));
        if (this.rightStore.activeNode && ids.includes(this.rightStore.activeNode)) this.rightStore.setActiveNode(null);
        this.setSelectedNodes([]);
        return true;
    }

    setCurrentPage(pageId: string): void {
        if (!this.bpPageMangers.some(page => page.pageId === pageId)) return;
        this.currentPageId = pageId;
    }

    loadBpPageContent(pageId: string): void {
        if (!this.bpPageMangers.some(page => page.pageId === pageId)) return;
        this.currentPageId = pageId;
        this.resetCanvas();
        this.scheduleLineRender();
    }

    addNewPage(): boolean {
        const snapshot = this.snapshotBox.get();
        if (!snapshot || !this.isActive()) return false;
        const pages = cloneDeep([...snapshot.pages]);
        pages.push({pageId: IdGenerate.generateId(), pageName: '新建页面', bpNodeLayoutMap: {}, bpNodeConfigMap: {}, bpLines: {}, bpAPMap: {}, bpAPLineMap: {}});
        return this.replacePages(pages, snapshot, true);
    }

    renamePage(pageId: string, name: string): boolean {
        return this.updatePage(pageId, page => { page.pageName = name; }, false);
    }

    deletePage(pageId: string): boolean {
        const snapshot = this.snapshotBox.get();
        if (!snapshot || !this.isActive() || snapshot.pages.length <= 1) return false;
        const pages = snapshot.pages.filter(page => page.pageId !== pageId);
        if (pages.length === snapshot.pages.length || !this.replacePages(pages, snapshot, true)) return false;
        if (this.currentPageId === pageId) this.loadBpPageContent(pages[0]!.pageId ?? '');
        return true;
    }

    setSelectedLines(lines: string[]): void { this.selectedLines = [...lines]; }
    setSelectedNodeIds(ids: string[]): void { this.selectedNodeIds = [...ids]; }
    setSelectedNodes(nodes: HTMLElement[]): void {
        this.selectedNodes.forEach(node => { node.style.border = '2px solid #00000000'; });
        this.selectedNodes = [...nodes];
        this.selectedNodes.forEach(node => { node.style.border = '2px solid #4FB8FF'; });
    }
    setNodeContainerRef = (ref: HTMLDivElement | null): void => { this.nodeContainerRef = ref; };
    setBpDragContentRef = (ref: HTMLDivElement | null): void => { this.bpDragContentRef = ref; };
    setCanvasOffset = (offset: IPoint): void => { this.canvasOffset = {...offset}; };
    setCanvasScale = (scale: number): void => { this.canvasScale = scale; };
    setCanvasTranslate = (position: IPoint): void => { this.canvasTranslate = {...position}; };
    setViewportController = (controller: EditorBlueprintSession['viewportController']): void => { this.viewportController = controller; };

    resetCanvas(): void {
        this.cancelLineRender();
        const controllers = Object.entries(this.currPageNodeControllers);
        const graphics = Object.values(this.lineInstances);
        this.selectedLines = [];
        this.selectedNodeIds = [];
        this.lineInstances = {};
        this.cleanupAll([
            ...controllers.map(([id, controller]) => () => this.unregisterController(id, controller)),
            () => this.setSelectedNodes([]),
            ...graphics.flatMap(graphic => [
                () => graphic?.removeAllListeners(), () => graphic?.clear(), () => graphic?.destroy(),
            ]),
        ], '清理蓝图页面资源失败。');
    }

    private cancelLineRender(): void {
        if (this.lineFrame === undefined) return;
        cancelAnimationFrame(this.lineFrame);
        this.lineFrame = undefined;
    }

    private scheduleLineRender(): void {
        this.cancelLineRender();
        const pageId = this.currentPageId;
        if (!pageId || typeof requestAnimationFrame !== 'function') return;
        this.lineFrame = requestAnimationFrame(() => {
            this.lineFrame = undefined;
            if (this.isActive() && this.currentPageId === pageId)
                BpCanvasUtil.reRenderAllLine(this);
        });
    }

    dispose(): void {
        if (!this.active) return;
        this.active = false;
        this.cleanupAll([
            () => this.cancelLineRender(),
            ...[...this.viewCleanups].reverse(),
            () => this.setViewportController(null),
            () => this.resetCanvas(),
            () => { this.pixiApp = null; this.nodeContainerRef = null; this.bpDragContentRef = null; },
            () => this.workspaceUIStore.resetPanelState(),
            () => this.leftStore.resetUsedNodes(),
            () => this.rightStore.setActiveNode(null),
            () => this.contextMenu.reset(),
        ], '清理蓝图编辑会话失败。');
    }
}
