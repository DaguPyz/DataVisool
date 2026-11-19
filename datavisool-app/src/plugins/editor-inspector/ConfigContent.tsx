/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import React, {Suspense, useEffect, useRef} from 'react';
import {observer} from 'mobx-react';
import type {AbstractDesignerController} from '@datavisool/sdk/core';
import type {ConfigType} from '@/shared/designer/ComponentConfigProps.ts';
import {Loading, globalMessage} from '@datavisool/ui';
import {CategoryManagement, Close, Copy, Refresh} from '@icon-park/react';
import TextUtil from '@/util/TextUtil.ts';
import ComponentStatusList from './status-list/ComponentStatusList.tsx';
import {AnimationConfig, BaseInfo, DataConfig, FilterConfig, ThemeConfig} from '@datavisool/sdk/host';
import {tx} from '@/i18n/miniI18n.ts';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {InspectorStore} from './InspectorStore.ts';
import {InspectorDomainContext} from './InspectorDomainContext.ts';

const ConfigContent = observer(({domain, store, trackTask}: {
    domain: EditorInspectorDomain;
    store: InspectorStore;
    trackTask<T>(task: Promise<T>): Promise<T>;
}) => {
    const configPanelRef = useRef<HTMLDivElement | null>(null);
    const resizeHandleRef = useRef<HTMLDivElement | null>(null);
    const resizeCleanupRef = useRef<() => void>(() => undefined);
    const {activeMenu, menus, activeElem} = store;
    const target = activeElem.id ? domain.readTarget(activeElem.id) : undefined;
    const controllerBinding = useRef<{
        domain: EditorInspectorDomain;
        id?: string;
        statusId: string | null;
        facade: ReturnType<EditorInspectorDomain['createControllerFacade']>;
        revision: number;
    }>();
    const previous = controllerBinding.current;
    if (!previous || previous.domain !== domain || previous.id !== activeElem.id
        || previous.statusId !== store.activatedStatus || !previous.facade?.isCurrent()) {
        controllerBinding.current = {
            domain,
            id: activeElem.id,
            statusId: store.activatedStatus,
            facade: activeElem.id ? domain.createControllerFacade(activeElem.id, store.activatedStatus) : undefined,
            revision: (previous?.revision ?? 0) + 1,
        };
    }
    const {facade: controllerFacade, revision: controllerRevision} = controllerBinding.current!;
    const controller = controllerFacade as unknown as AbstractDesignerController | undefined;
    const componentInfo = target?.componentInfo;

    useEffect(() => {
        if (activeElem.id && (!domain.isActive() || !target)) store.clearTarget();
    }, [activeElem.id, domain, target]);

    const copyComponentId = () => {
        TextUtil.copyToClipboard(String(componentInfo?.id ?? '')).then(() => {
            globalMessage.messageApi?.success(tx('已复制组件id'));
        });
    };

    const copyComponentConfig = () => {
        const config = controllerFacade?.getConfig();
        if (!config) return;
        TextUtil.copyToClipboard(JSON.stringify(config, null, 2)).then(() => {
            globalMessage.messageApi?.success(tx('已复制组件配置信息'));
        });
    };

    const buildConfigContent = () => {
        if (!target || !controller) return;
        const normalizedConfigMapping: Record<string, React.ComponentType<ConfigType>> = {
            animation: AnimationConfig,
            base: BaseInfo,
            filter: FilterConfig,
            theme: ThemeConfig,
            data: DataConfig,
            ...(target.configPanels || {}),
        };
        const ConfigComp = normalizedConfigMapping[activeMenu];
        if (!ConfigComp) return;
        return (
            <InspectorDomainContext.Provider value={{domain, target, store, canEdit: () => store.isAccepting && domain.isActive(), trackTask}}>
                <Suspense fallback={<Loading/>}>
                    <ConfigComp key={controllerRevision} controller={controller}/>
                </Suspense>
            </InspectorDomainContext.Provider>
        );
    };

    const handleMouseDown = (event: MouseEvent) => {
        if (!store.isAccepting) return;
        event.preventDefault();
        if (!configPanelRef.current) return;
        const startX = event.clientX;
        const initialWidth = configPanelRef.current.offsetWidth;
        resizeHandleRef.current?.classList.add('resize-handle-active');
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = initialWidth + startX - moveEvent.clientX;
            if (newWidth >= 360 && newWidth <= 520 && configPanelRef.current)
                configPanelRef.current.style.width = `${newWidth}px`;
        };
        let cleaned = false;
        const handleMouseUp = () => {
            if (cleaned) return;
            cleaned = true;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            resizeHandleRef.current?.classList.remove('resize-handle-active');
            if (resizeCleanupRef.current === handleMouseUp) resizeCleanupRef.current = () => undefined;
        };
        resizeCleanupRef.current = handleMouseUp;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    useEffect(() => {
        const resizeHandle = resizeHandleRef.current;
        resizeHandle?.addEventListener('mousedown', handleMouseDown);
        const unregisterPauseCleanup = store.registerPauseCleanup(() => resizeCleanupRef.current());
        return () => {
            resizeHandle?.removeEventListener('mousedown', handleMouseDown);
            resizeCleanupRef.current();
            unregisterPauseCleanup();
        };
    }, [store]);

    const onResetConfig = () => {
        if (!store.isAccepting || !target || !domain.isActive()) return;
        if (!domain.resetConfig(target.id, store.activatedStatus)) {
            globalMessage.messageApi?.info(tx('当前组件已是默认状态'));
            return;
        }
        globalMessage.messageApi?.success(tx('已重置为默认状态'));
    };

    const activeMenuName = menus.find(menu => menu.key === activeMenu)?.name ?? '';
    if (!target || !controller || !domain.isActive()) return null;
    const blockPausedAction = (event: React.SyntheticEvent) => {
        if (store.isAccepting) return;
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <div className="datavisool-config-panel" id="datavisool-config-panel" data-config-menu={activeMenu} data-workspace-occlusion="right" data-viewport-ui="" data-inspector-paused={!store.isAccepting || undefined} aria-disabled={!store.isAccepting} onClickCapture={blockPausedAction} onChangeCapture={blockPausedAction} onKeyDownCapture={blockPausedAction} onMouseDownCapture={blockPausedAction} onPointerDownCapture={blockPausedAction} role="region" aria-label={tx('组件属性')}>
            {store.statusListVisible && <ComponentStatusList domain={domain} componentId={target.id} store={store}/>}
            <div className="resize-handle" ref={resizeHandleRef}></div>
            <div className="datavisool-config-detail" ref={configPanelRef}>
                <div className="datavisool-detail-top">
                    <div className="detail-title"><span>{tx(activeMenuName)}</span></div>
                    <div className="detail-operate">
                        <span className="operate-icon" title={tx('重置为默认状态')}><Refresh theme="outline" size="16" onClick={onResetConfig}/></span>
                        <span className="operate-icon" title={tx('状态管理')}><CategoryManagement theme="outline" size="16" onClick={() => store.setStatusListVisible(true)}/></span>
                        <button type="button" className="operate-icon" title={tx('关闭面板')} aria-label={tx('关闭面板')} onClick={() => store.setContentVisible(false)}><Close theme="outline" size="16"/></button>
                    </div>
                </div>
                <div className="datavisool-detail-content">
                    <div className="component-info">
                        <div className="component-info-main">
                            <div className="component-info-identity">
                                <div className="component-info-mark">{String(tx(String(componentInfo?.compName ?? '')) ?? '').slice(0, 1)}</div>
                                <div className="component-info-title">
                                    <div className="component-info-name">{String(tx(String(componentInfo?.compName ?? '')) ?? '')}</div>
                                    <button type="button" className="component-info-id" onClick={copyComponentId} title={tx('点击复制组件id')}>
                                        <span>ID</span><em>{String(componentInfo?.id ?? '')}</em>
                                    </button>
                                </div>
                            </div>
                            <button type="button" className="component-info-copy" onClick={copyComponentConfig} title={tx('复制组件配置信息')}>
                                <Copy theme="outline" size={14}/>
                            </button>
                        </div>
                        <div className="component-info-meta">
                            <span className="component-info-meta-item"><span className="component-info-meta-label">{tx('类型')}</span><span>{String(componentInfo?.type ?? '')}</span></span>
                            <span className="component-info-meta-item"><span className="component-info-meta-label">{tx('版本')}</span><span>{String(componentInfo?.version ?? tx('无版本信息'))}</span></span>
                        </div>
                    </div>
                    {store.detailVisible && buildConfigContent()}
                </div>
            </div>
        </div>
    );
});

export default ConfigContent;
