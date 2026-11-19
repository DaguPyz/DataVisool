/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {action, makeObservable, observable} from 'mobx';
import type {MenuInfo} from '@datavisool/sdk/core';
import type {EditorInspectorStatusItem, EditorInspectorStatusSnapshot, EditorInspectorTarget} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {ILayerItem} from '@datavisool/sdk/types';
import {ColorFilter, SettingOne, Theme} from '@icon-park/react';

export interface InspectorActiveElement {
    readonly id?: string;
    readonly type?: string;
}

interface BaseInfoRef {
    setState(patch: Partial<ILayerItem>): void;
    cancelPending?(): void;
}

export class InspectorStore {
    constructor() {
        makeObservable(this, {
            activeElem: observable.ref,
            menus: observable,
            activeMenu: observable,
            panelOpen: observable,
            panelOpenOrder: observable,
            accepting: observable,
            lifecycleRevision: observable,
            configRevision: observable,
            detailVisible: observable,
            statusListVisible: observable,
            statusEditId: observable,
            activatedStatus: observable,
            statusItems: observable,
            setActiveMenu: action,
            setAccepting: action,
            setContentVisible: action,
            setDetailVisible: action,
            setStatusListVisible: action,
            setStatusEditId: action,
            setActivatedStatus: action,
            setStatuses: action,
            activateTarget: action,
            clearTarget: action,
            remountConfigDetailsPanel: action,
            applyLayerUpdates: action,
            clearStatuses: action,
            resetForSceneChange: action,
            dispose: action,
        });
    }

    activeElem: InspectorActiveElement = {};
    menus: MenuInfo[] = [];
    activeMenu = '';
    panelOpen = false;
    panelOpenOrder = 0;
    accepting = true;
    lifecycleRevision = 0;
    configRevision = 0;
    detailVisible = true;
    statusListVisible = false;
    statusEditId: string | null = null;
    activatedStatus: string | null = null;
    statusItems: EditorInspectorStatusItem[] = [];

    private readonly menuTriggerRefs = new Map<string, HTMLButtonElement>();
    private readonly pauseCleanups = new Set<() => void>();
    private restoreMenuFocusAfterClose = true;
    private nextPanelOrder: (() => number) | undefined;
    private baseInfoRef: (BaseInfoRef & {readonly id: string}) | undefined;
    private detailRemountTimer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;

    get isAccepting() { return this.accepting && !this.disposed; }

    registerPauseCleanup(cleanup: () => void) {
        if (this.disposed || !this.accepting) {
            try { cleanup(); }
            catch (error) { console.error('清理属性面板暂停资源失败', error); }
            return () => undefined;
        }
        this.pauseCleanups.add(cleanup);
        return () => { this.pauseCleanups.delete(cleanup); };
    }

    private runPauseCleanups() {
        for (const cleanup of [...this.pauseCleanups]) {
            try { cleanup(); }
            catch (error) { console.error('清理属性面板暂停资源失败', error); }
        }
    }

    setPanelOrderProvider(next: () => number) {
        if (!this.isAccepting) return;
        this.nextPanelOrder = next;
    }

    setMenuTriggerRef(menu: string, element: HTMLButtonElement | null) {
        if (this.disposed) return;
        if (element) this.menuTriggerRefs.set(menu, element);
        else this.menuTriggerRefs.delete(menu);
    }

    focusActiveMenuTrigger = () => {
        if (!this.isAccepting) return;
        const trigger = this.menuTriggerRefs.get(this.activeMenu) || this.menuTriggerRefs.values().next().value;
        trigger?.focus();
    }

    consumeMenuFocusRestore = () => {
        if (!this.isAccepting) return false;
        const restoreFocus = this.restoreMenuFocusAfterClose;
        this.restoreMenuFocusAfterClose = true;
        return restoreFocus;
    }

    setActiveMenu(menu: string) {
        if (!this.isAccepting) return;
        this.activeMenu = menu;
    }

    setAccepting(accepting: boolean) {
        if (this.disposed || this.accepting === accepting) return;
        this.accepting = accepting;
        this.lifecycleRevision++;
        if (!accepting) {
            if (this.detailRemountTimer) {
                clearTimeout(this.detailRemountTimer);
                this.detailRemountTimer = undefined;
                this.detailVisible = true;
            }
            try { this.baseInfoRef?.cancelPending?.(); }
            catch (error) { console.error('清理属性面板待处理编辑失败', error); }
            this.runPauseCleanups();
        }
    }

    setContentVisible(visible: boolean, restoreFocus = true) {
        if (!this.isAccepting) return;
        this.restoreMenuFocusAfterClose = visible || restoreFocus;
        this.panelOpen = visible;
        if (visible) this.panelOpenOrder = this.nextPanelOrder?.() ?? this.panelOpenOrder + 1;
    }

    setDetailVisible(visible: boolean) {
        if (!this.isAccepting) return;
        this.detailVisible = visible;
    }

    setStatusListVisible(visible: boolean) {
        if (!this.isAccepting) return;
        this.statusListVisible = visible;
        if (!visible) this.clearStatuses();
    }

    setStatusEditId(id: string | null) {
        if (!this.isAccepting) return;
        this.statusEditId = id;
    }

    setActivatedStatus(id: string | null) {
        if (!this.isAccepting) return;
        this.activatedStatus = id;
    }

    setStatuses(snapshot: EditorInspectorStatusSnapshot | undefined) {
        if (!this.isAccepting) return;
        this.statusItems = snapshot ? [...snapshot.items] : [];
    }

    activateTarget(target: EditorInspectorTarget, source: 'canvas' | 'layer-list' = 'canvas') {
        if (!this.isAccepting) return;
        const sameTarget = this.activeElem.id === target.id;
        const currentMenu = this.activeMenu;
        this.activeElem = {id: target.id, type: target.type};
        this.menus = [
            {icon: SettingOne, name: '基础', key: 'base'},
            ...target.menus.filter(menu => !['base', 'filter', 'theme'].includes(menu.key)),
            {icon: ColorFilter, name: '滤镜', key: 'filter'},
            {icon: Theme, name: '主题', key: 'theme'},
        ];
        const hasStyleMenu = this.menus.some(menu => menu.key === 'style');
        this.activeMenu = sameTarget && this.menus.some(menu => menu.key === currentMenu)
            ? currentMenu
            : target.type === 'group' || !hasStyleMenu ? 'base' : 'style';
        const keepListOpen = source === 'layer-list' && typeof window !== 'undefined' && window.innerWidth <= 959;
        this.setContentVisible(!keepListOpen, false);
        this.configRevision += 1;
        if (!sameTarget) {
            this.activatedStatus = null;
            this.statusItems = [];
        }
    }

    refreshTarget(target: EditorInspectorTarget) {
        if (!this.isAccepting) return;
        const activeMenu = this.activeMenu;
        const sameTarget = this.activeElem.id === target.id;
        this.activeElem = {id: target.id, type: target.type};
        this.menus = [
            {icon: SettingOne, name: '基础', key: 'base'},
            ...target.menus.filter(menu => !['base', 'filter', 'theme'].includes(menu.key)),
            {icon: ColorFilter, name: '滤镜', key: 'filter'},
            {icon: Theme, name: '主题', key: 'theme'},
        ];
        this.activeMenu = this.menus.some(menu => menu.key === activeMenu) ? activeMenu : this.activeMenu;
        this.configRevision += 1;
        if (!sameTarget) this.clearStatuses();
    }

    clearTarget() {
        if (!this.isAccepting) return;
        this.clearTargetState();
    }

    resetForSceneChange() {
        this.clearTargetState();
    }

    private clearTargetState() {
        this.runPauseCleanups();
        if (this.detailRemountTimer) {
            clearTimeout(this.detailRemountTimer);
            this.detailRemountTimer = undefined;
        }
        this.detailVisible = true;
        try { this.baseInfoRef?.cancelPending?.(); }
        catch (error) { console.error('清理属性面板待处理编辑失败', error); }
        this.baseInfoRef = undefined;
        this.activeElem = {};
        this.activeMenu = '';
        this.menus = [];
        this.restoreMenuFocusAfterClose = false;
        this.panelOpen = false;
        this.configRevision += 1;
        this.statusListVisible = false;
        this.statusItems = [];
        this.activatedStatus = null;
        this.statusEditId = null;
    }

    remountConfigDetailsPanel() {
        if (!this.isAccepting) return;
        if (this.detailRemountTimer) clearTimeout(this.detailRemountTimer);
        this.setDetailVisible(false);
        this.detailRemountTimer = setTimeout(() => {
            this.detailRemountTimer = undefined;
            this.setDetailVisible(true);
        }, 0);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.accepting = false;
        try { this.baseInfoRef?.cancelPending?.(); }
        catch (error) { console.error('清理属性面板待处理编辑失败', error); }
        this.runPauseCleanups();
        if (this.detailRemountTimer) clearTimeout(this.detailRemountTimer);
        this.detailRemountTimer = undefined;
        this.activeElem = {};
        this.menus = [];
        this.activeMenu = '';
        this.panelOpen = false;
        this.statusListVisible = false;
        this.statusEditId = null;
        this.detailVisible = true;
        this.statusItems = [];
        this.activatedStatus = null;
        this.configRevision++;
        this.lifecycleRevision++;
        this.baseInfoRef = undefined;
        this.restoreMenuFocusAfterClose = true;
        this.menuTriggerRefs.clear();
        this.pauseCleanups.clear();
        this.nextPanelOrder = undefined;
    }

    setBaseInfoRef(id: string, ref: BaseInfoRef | null) {
        if (this.disposed && ref) return;
        if (ref) this.baseInfoRef = {
            id,
            setState: patch => ref.setState(patch),
            cancelPending: () => ref.cancelPending?.(),
        };
        else if (this.baseInfoRef?.id === id) this.baseInfoRef = undefined;
    }

    applyLayerUpdates(layers: readonly (Pick<ILayerItem, 'id'> & Partial<ILayerItem>)[]) {
        if (!this.isAccepting) return;
        const activeId = this.activeElem.id;
        if (!activeId || this.baseInfoRef?.id !== activeId) return;
        const patch = layers.find(layer => layer.id === activeId);
        if (patch) this.baseInfoRef.setState(patch);
    }

    clearStatuses() {
        if (!this.isAccepting) return;
        this.statusItems = [];
        this.activatedStatus = null;
        this.statusEditId = null;
    }
}

export function createInspectorStore() { return new InspectorStore(); }
