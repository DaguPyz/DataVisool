/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {Suspense, useEffect, useRef} from 'react';
import rightStore from "./RightStore";
import {observer} from "mobx-react";
import {AbstractDefinition} from "@datavisool/sdk/core";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController";
import {Loading} from "@datavisool/ui";
import type {AbstractController} from "@datavisool/sdk/core";
import {CategoryManagement, Close, Copy, Refresh} from "@icon-park/react";
import TextUtil from "@/util/TextUtil.ts";
import {globalMessage} from "@datavisool/ui";
import ComponentStatusList from "./status-list/ComponentStatusList.tsx";
import {ObjectUtil} from "@datavisool/sdk";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import statusListStore from "./status-list/StatusListStore.ts";
import StatusListStore from "./status-list/StatusListStore.ts";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import BaseInfo from "@/comps/common-component/base-info/BaseInfo.tsx";
import ThemeConfig from "@/comps/common-component/theme-config/ThemeConfig.tsx";
import FilterConfig from "@/comps/common-component/filter-config/FilterConfig.tsx";
import DataConfig from "@/comps/common-component/data-config/DataConfig.tsx";
import {cloneDeep, isEqual} from "lodash";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import {createConfigControllerProxy} from "./ConfigControllerProxy";
import {tx} from "@/i18n/miniI18n.ts";

export interface ConfigType<T extends AbstractController = AbstractDesignerController> {
    controller: T;
}

const PRESERVED_RESET_CONFIG_KEYS = new Set(['base', 'status']);
const COMMON_RESET_CONFIG_KEYS = ['style', 'data', 'filter'];
const DEFAULT_FILTER_CONFIG = {
    enable: false,
    blur: 0,
    brightness: 1,
    contrast: 1,
    opacity: 1,
    saturate: 1,
    hueRotate: 0
}

const hasOwn = (target: Record<string, any> | null | undefined, key: string) => {
    return !!target && Object.prototype.hasOwnProperty.call(target, key);
}

const getResetKeys = (currentConfig: Record<string, any>, defaultConfig: Record<string, any>) => {
    const keys = new Set<string>();
    Object.keys(defaultConfig ?? {}).forEach((key) => {
        if (!PRESERVED_RESET_CONFIG_KEYS.has(key))
            keys.add(key);
    });
    COMMON_RESET_CONFIG_KEYS.forEach((key) => {
        if (hasOwn(currentConfig, key))
            keys.add(key);
    });
    return Array.from(keys);
}

const buildDefaultResetConfig = (resetKeys: string[], defaultConfig: Record<string, any>) => {
    return resetKeys.reduce((result, key) => {
        if (hasOwn(defaultConfig, key)) {
            result[key] = cloneDeep(defaultConfig[key]);
        } else if (key === 'filter') {
            result[key] = cloneDeep(DEFAULT_FILTER_CONFIG);
        }
        return result;
    }, {} as Record<string, any>);
}

const pickCurrentConfig = (currentConfig: Record<string, any>, resetKeys: string[]) => {
    return resetKeys.reduce((result, key) => {
        if (hasOwn(currentConfig, key))
            result[key] = cloneDeep(currentConfig[key]);
        return result;
    }, {} as Record<string, any>);
}

const hasResetChange = (currentConfig: Record<string, any>, resetConfig: Record<string, any>, resetKeys: string[]) => {
    return resetKeys.some((key) => {
        const currentHasKey = hasOwn(currentConfig, key);
        const resetHasKey = hasOwn(resetConfig, key);
        if (currentHasKey !== resetHasKey)
            return true;
        return !isEqual(currentConfig[key], resetConfig[key]);
    });
}

const replaceControllerConfig = (targetController: AbstractDesignerController, config: Record<string, any>, replaceKeys: string[]) => {
    const targetConfig = targetController.config as Record<string, any> | null;
    if (targetConfig) {
        replaceKeys.forEach((key) => {
            if (hasOwn(config, key))
                targetConfig[key] = cloneDeep(config[key]);
            else
                delete targetConfig[key];
        });
    }
    targetController.update(config);
    if (replaceKeys.includes('filter'))
        targetController.updateFilter(hasOwn(config, 'filter') ? config.filter : undefined);
}

const replaceStatusConfig = (targetController: AbstractDesignerController, statusId: string, config: Record<string, any>, replaceKeys: string[]) => {
    const statusConfig = getStatusConfig(targetController, statusId);
    if (!statusConfig)
        return;
    replaceConfigKeys(statusConfig, config, replaceKeys);
}

const replaceConfigKeys = (targetConfig: Record<string, any>, config: Record<string, any>, replaceKeys: string[]) => {
    replaceKeys.forEach((key) => {
        if (hasOwn(config, key))
            targetConfig[key] = cloneDeep(config[key]);
        else
            delete targetConfig[key];
    });
    return targetConfig;
}

const getStatusConfig = (targetController: AbstractDesignerController, statusId?: string | null) => {
    if (!statusId)
        return null;
    const targetConfig = targetController.config as Record<string, any> | null;
    return targetConfig?.status?.[statusId]?.config as Record<string, any> | null ?? null;
}

const syncDataGlobalVariableBinding = (targetController: AbstractDesignerController, fallbackId?: string) => {
    const componentId = targetController.getConfig()?.base?.id ?? fallbackId;
    if (!componentId)
        return;
    componentDataGvParser.unbindFromGv([componentId]);
    if (targetController.getConfig()?.data)
        componentDataGvParser.bindConfigToGv(targetController);
}

const ConfigContent = observer(() => {
    const configPanelRef = useRef<HTMLDivElement | null>(null);
    const resizeHandleRef = useRef<HTMLDivElement | null>(null);

    const {activeMenu, menus, activeElem} = rightStore;
    const definition: AbstractDefinition = DesignerLoader.definitionMap[activeElem.type + '']
    const {controllers} = window.DATAVISOOL_ENV.currentManager.layerManager
    const controller = controllers[activeElem.id + ''];
    const componentInfo = {...controller?.config?.base ?? {}, ...definition?.getBaseInfo() ?? {}};

    const copyComponentId = () => {
        TextUtil.copyToClipboard(componentInfo.id ?? '').then(() => {
            globalMessage.messageApi?.success(tx('已复制组件id'));
        })
    }

    const copyComponentConfig = () => {
        const config = controller.getConfig();
        TextUtil.copyToClipboard(JSON.stringify(config, null, 2)).then(() => {
            globalMessage.messageApi?.success(tx('已复制组件配置信息'));
        })
    }

    const createProxy = (controller: AbstractDesignerController) => {
        return createConfigControllerProxy(controller, (target, args) => {
            //记录操作历史
            const newValue = args[0];
            const oldValue = ObjectUtil.getOriginValue(target.config, args[0]);
            const activeStatusId = statusListStore.activatedStatus;
            const statusConfig = !newValue['base'] ? getStatusConfig(target, activeStatusId) : null;
            const oldStatusValue = statusConfig ? cloneDeep(statusConfig) : null;
            const newStatusValue = statusConfig ? ObjectUtil.merge(cloneDeep(statusConfig), newValue) : null;
            historyRecordOperateProxy.doStyleUpd(
                newValue,
                oldValue,
                undefined,
                undefined,
                activeStatusId && oldStatusValue ? {id: activeStatusId, data: oldStatusValue, replaceAll: true} : undefined,
                activeStatusId && newStatusValue ? {id: activeStatusId, data: newStatusValue, replaceAll: true} : undefined,
            );
            if (activeStatusId && statusConfig) {
                ObjectUtil.merge(statusConfig, newValue);
            }
            target.update(args[0], args[1]);
        });
    }

    const buildConfigContent = () => {
        if (!definition) return;
        const configMapping = definition.getMenuToConfigContentMap();
        const normalizedConfigMapping: Record<string, React.ComponentType<ConfigType>> = {
            base: BaseInfo,
            filter: FilterConfig,
            theme: ThemeConfig,
            data: DataConfig,
            ...(configMapping || {})
        };
        const ConfigComp: React.ComponentType<ConfigType> = normalizedConfigMapping[activeMenu];
        if (!ConfigComp) return;
        const rawController = controllers[activeElem.id + ''];
        if (!rawController) return null
        const controller = createProxy(rawController);
        return (
            <Suspense fallback={<Loading/>}>
                <ConfigComp controller={controller}/>
            </Suspense>
        );
    };

    const handleMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        if (configPanelRef.current) {
            const startX = e.clientX;
            const initialWidth = configPanelRef.current.offsetWidth;
            resizeHandleRef.current && (resizeHandleRef.current.classList.add('resize-handle-active'));

            const handleMouseMove = (e: MouseEvent) => {
                const endX = e.clientX;
                const diffX = startX - endX;
                const newWidth = initialWidth + diffX;
                if (newWidth >= 360 && newWidth <= 520 && configPanelRef.current)
                    configPanelRef.current.style.width = newWidth + 'px';
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                resizeHandleRef.current && (resizeHandleRef.current.classList.remove('resize-handle-active'));
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
    };

    useEffect(() => {
        const resizeHandle = resizeHandleRef.current;
        if (resizeHandleRef.current)
            resizeHandleRef.current.addEventListener('mousedown', handleMouseDown);

        return () => {
            if (resizeHandle)
                resizeHandle.removeEventListener('mousedown', handleMouseDown);
        };
    }, []);

    const onClose = () => {
        const {setContentVisible} = rightStore;
        setContentVisible && setContentVisible(false);
    }

    const onResetConfig = () => {
        if (!controller || !definition)
            return;
        const currentConfig = controller.getConfig() as Record<string, any> | null;
        const defaultConfig = cloneDeep(definition.getInitConfig()) as Record<string, any> | null;
        if (!currentConfig || !defaultConfig)
            return;
        const resetKeys = getResetKeys(currentConfig, defaultConfig);
        const resetConfig = buildDefaultResetConfig(resetKeys, defaultConfig);
        if (!hasResetChange(currentConfig, resetConfig, resetKeys)) {
            globalMessage.messageApi?.info(tx('当前组件已是默认状态'));
            return;
        }
        const previousConfig = pickCurrentConfig(currentConfig, resetKeys);
        const activeStatusId = statusListStore.activatedStatus;
        const statusConfig = getStatusConfig(controller, activeStatusId);
        const previousStatusConfig = statusConfig ? cloneDeep(statusConfig) : null;
        const nextStatusConfig = statusConfig ? replaceConfigKeys(cloneDeep(statusConfig), resetConfig, resetKeys) : null;
        historyRecordOperateProxy.doStyleUpd(
            resetConfig,
            previousConfig,
            activeElem.id,
            resetKeys,
            activeStatusId && previousStatusConfig ? {id: activeStatusId, data: previousStatusConfig, replaceAll: true} : undefined,
            activeStatusId && nextStatusConfig ? {id: activeStatusId, data: nextStatusConfig, replaceAll: true} : undefined,
        );
        if (activeStatusId && statusConfig)
            replaceStatusConfig(controller, activeStatusId, resetConfig, resetKeys);
        replaceControllerConfig(controller, resetConfig, resetKeys);
        if (resetKeys.includes('data'))
            syncDataGlobalVariableBinding(controller, activeElem.id);
        rightStore.remountConfigDetailsPanel();
        globalMessage.messageApi?.success(tx('已重置为默认状态'));
    }

    let activeMenuName = '';
    for (let i = 0; i < menus.length; i++) {
        if (menus[i].key === activeMenu) {
            activeMenuName = tx(menus[i].name);
            break;
        }
    }

    if (!controller) {
        rightStore.activeConfig(null, '');
        return null;
    }

    return (
        <div className={'datavisool-config-panel'} id="datavisool-config-panel" data-config-menu={activeMenu} data-workspace-occlusion="right" data-viewport-ui="" role="region" aria-label={tx('组件属性')}>
            {statusListStore.visible && <ComponentStatusList/>}
            <div className="resize-handle" ref={resizeHandleRef}></div>
            <div className="datavisool-config-detail" ref={configPanelRef}>
                <div className={'datavisool-detail-top'}>
                    <div className={'detail-title'}><span>{activeMenuName}</span></div>
                    <div className={'detail-operate'}>
                        <span className="operate-icon" title={tx('重置为默认状态')}><Refresh theme="outline" size="16" onClick={onResetConfig}/></span>
                        <span className="operate-icon" title={tx('状态管理')}><CategoryManagement theme="outline" size="16" onClick={() => StatusListStore.setVisible(true)}/></span>
                        <button type="button" className="operate-icon" title={tx('关闭面板')} aria-label={tx('关闭面板')} onClick={onClose}><Close theme="outline" size="16"/></button>
                    </div>
                </div>
                <div className={'datavisool-detail-content'}>
                    <div className={'component-info'}>
                        <div className="component-info-main">
                            <div className="component-info-identity">
                                <div className="component-info-mark">{tx(componentInfo.compName)?.slice(0, 1)}</div>
                                <div className="component-info-title">
                                    <div className="component-info-name">{tx(componentInfo.compName)}</div>
                                    <button type="button" className="component-info-id" onClick={copyComponentId} title={tx('点击复制组件id')}>
                                        <span>ID</span>
                                        <em>{componentInfo.id}</em>
                                    </button>
                                </div>
                            </div>
                            <button type="button" className="component-info-copy" onClick={copyComponentConfig} title={tx('复制组件配置信息')}>
                                <Copy theme="outline" size={14}/>
                            </button>
                        </div>
                        <div className="component-info-meta">
                            <span className="component-info-meta-item">
                                <span className="component-info-meta-label">{tx('类型')}</span>
                                <span>{componentInfo.type}</span>
                            </span>
                            <span className="component-info-meta-item">
                                <span className="component-info-meta-label">{tx('版本')}</span>
                                <span>{componentInfo.version || tx('无版本信息')}</span>
                            </span>
                        </div>
                    </div>
                    {rightStore.detailVisible && buildConfigContent()}
                </div>
            </div>
        </div>
    );
})

export default ConfigContent;
