/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {cloneDeep, throttle} from "lodash";
import {historyOperator} from "@/designer/operate-provider/undo-redo/HistoryOperator";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy";
import undoRedoMap from "@/designer/operate-provider/undo-redo/core";
import runtimeConfigStore from "@/designer/store/RuntimeStore.ts";
import footerStore from "@/designer/footer/FooterStore";
import layerListStore from "@/designer/left/layer-list/LayerListStore.ts";
import {globalMessage} from "@datavisool/ui";
import baseApi from "@/api/engineering/BaseApi.ts";
import {ILayerItem} from "@datavisool/sdk/types";
import {IProjectInfoManager} from "@datavisool/sdk/types";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import CoordinateUtil from "@/util/CoordinateUtil.ts";
import {globalModal} from "@datavisool/ui";
import {createElement, useState} from "react";
import {CheckBox, Input, TextArea} from "@datavisool/ui";
import managerStore from "@/designer/manager/ManagerStore.ts";
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";
import rightStore from "@/designer/right/RightStore.ts";
import designerLeftStore from "@/designer/left/DesignerLeftStore.ts";
import ProjectUtil, {ProjectGraphCycleError} from "@/util/ProjectUtil.ts";
import ProjectDataCodecUtil from "@/util/ProjectDataCodecUtil.ts";
import {showProjectImportSuccess} from "@/util/ProjectImportResult.ts";
import ExportRiskUtil from "@/util/ExportRiskUtil.ts";
import ExportSecretUtil, {ExportSecretMode} from "@/util/ExportSecretUtil.ts";
import {EncryptResult, HybridCryptoUtil} from "@/util/HybridCryptoUtil.ts";
import NProgress from "nprogress";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil.ts";
import bpHistoryRecordOperateProxy from "@/designer/operate-provider/undo-redo/BPHistoryRecordOperateProxy";
import {DesignerMode, DesignerScene} from "@datavisool/sdk/types";
import * as selectionCommands from "@/designer/operate-provider/selection/SelectionCommands.ts";

export const selectAll = selectionCommands.selectAll;

export const openAiDrivenConsole = () => {
    designerLeftStore.setAiDrivenVisible(true);
}

/**
 * 克隆组件
 */
export const doClone = selectionCommands.doClone;

/**
 * 粘贴
 */
export const doPaste = (data: string) => {
    if (!data || !data.includes('DATAVISOOL_COPY'))
        return;
    const template = JSON.parse(data);
    if (template && template.flag === 'DATAVISOOL_COPY' && template.layers) {
        const {canvasManager} = window.DATAVISOOL_ENV.currentManager;
        //恢复组件位置
        Object.keys(template.layers).forEach(layerId => {
            const layer = template.layers[layerId];
            const {width = 0, height = 0} = canvasManager?.canvasConfig ?? {width: 0, height: 0};
            if (layer && layer.type !== 'group') {
                layer.x = Math.round((width / 2) + (layer?.x ?? 0));
                layer.y = Math.round((height / 2) + (layer?.y ?? 0));
            }
        });
        historyRecordOperateProxy.doUseTemplate(template);
    }
}

/**
 * 复制
 */
export const doCopy = selectionCommands.doCopy;
export const doLock = selectionCommands.doLock;
export const doUnLock = selectionCommands.doUnLock;
export const layerToTop = selectionCommands.layerToTop;
export const layerToBottom = selectionCommands.layerToBottom;
export const layerMoveUp = selectionCommands.layerMoveUp;
export const layerMoveDown = selectionCommands.layerMoveDown;
export const deleteLayersByIds = selectionCommands.deleteLayersByIds;
export const doDelete = selectionCommands.doDelete;

//保存函数节流5s, 5s内不可重复保存
export const throttleSave = throttle(async () => doSave(), 5000, {trailing: false});

/**
 * 获取保存数据
 */
export const getSaveData = (): IProjectInfoManager | null => {
    const manager = managerStore.currentFinalManager;
    if (!manager) return null;
    const {id} = manager;
    const proData = manager.getData();
    if (!id || !proData)
        return null;
    const raw = ProjectUtil.serializeProjectData(proData);
    return {
        id: id!,
        dataJson: ProjectDataCodecUtil.compressIfBeneficial(raw),
    }
}

export const doSave = async () => {
    NProgress.configure({minimum: 0.5});
    NProgress.start();
    footerStore.setSaving(true);
    footerStore.setSaveState('saving');
    try {
        const projectInfo = getSaveData();
        if (!projectInfo) {
            footerStore.setSaveState('failed');
            globalMessage.messageApi?.error('保存失败');
            return false;
        }
        const result = await baseApi.updateProject(projectInfo);
        if (!result) {
            footerStore.setSaveState('failed');
            globalMessage.messageApi?.error('保存失败');
            return false;
        }
        footerStore.setLatestSaveTime(new Date().toLocaleTimeString());
        footerStore.setSaveState('saved');
        return result;
    } catch (error) {
        footerStore.setSaveState('failed');
        console.error('保存项目失败', error);
        globalMessage.messageApi?.error('保存失败');
        return false;
    } finally {
        footerStore.setSaving(false);
        NProgress.done();
    }
}

export const doHide = selectionCommands.doHide;

/**
 * 图层编组,
 * 编组时候，如果都是普通组件图层，则直接编组
 * 如果包含了已经分组的图层，则将将已经编组的这个组作为基本图层和其他图层进行编组，
 * 比如有A,B,C三个普通图层，则编组的时候可直接生成编组G
 * 如果A,B已经编组为G1，此时再选中A,C或B,C，或者A,B,C，则编组的时候，G1作为基本图层，和C进行编组，生成G2
 */
export const doGrouping = () => {
    if (selectionCommands.canManageSelectedObjects())
        historyRecordOperateProxy.doGrouping();
}

export const doUnGrouping = () => {
    if (selectionCommands.canManageSelectedObjects())
        historyRecordOperateProxy.doUnGrouping();
}


export const removeFromGroup = () => {
    if (selectionCommands.canManageSelectedObjects())
        historyRecordOperateProxy.doRemoveFromGroup();
}

export const cleanEmptyGroupings = () => {
    const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager;
    const emptyGroupIdArr = LayerUtil.findEmptyGrouping(Object.values(layerConfigs));
    deleteLayersByIds(emptyGroupIdArr);
}

/*************************快捷键控制移动组件的位置*************************/

const isSingleTransformLayer = (ids: string[], layers: Record<string, ILayerItem>) => {
    return ids.length === 1 && layers[ids[0]]?.type !== "group";
};

export const doMoveUp = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {dragStep = 1}} = canvasManager!;
    let yPos;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        yPos = (layerConfigs[id].y || 0) - dragStep;
    } else {
        yPos = (groupCoordinate?.minY || 0) - dragStep;
    }
    interactionRef?.request("draggable", {y: yPos}, true);
}

export const doMoveDown = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {dragStep = 1}} = canvasManager!;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        const yPos = layerConfigs[id].y! + dragStep;
        interactionRef?.request("draggable", {y: yPos}, true);
    } else {
        const yPos = (groupCoordinate?.minY ?? Infinity) + dragStep;
        interactionRef?.request("draggable", {y: yPos}, true);
    }
}

export const doMoveLeft = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {dragStep = 1}} = canvasManager!;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        const xPos = layerConfigs[id].x!;
        interactionRef?.request("draggable", {x: xPos - dragStep}, true);
    } else {
        const xPos = (groupCoordinate?.minX ?? Infinity) - dragStep;
        interactionRef?.request("draggable", {x: xPos}, true);
    }
}

export const doMoveRight = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {dragStep = 1}} = canvasManager!;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        const xPos = layerConfigs[id].x!;
        interactionRef?.request("draggable", {x: xPos + dragStep}, true);
    } else {
        const xPos = (groupCoordinate?.minX ?? Infinity) + dragStep;
        interactionRef?.request("draggable", {x: xPos}, true);
    }
}

/*************************快捷键控制缩放组件尺寸*************************/

/**
 * 以底部为基准向上扩大
 */
export const doBaseBottomEnlargeUp = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        height = layerConfigs[id].height! + resizeStep;
    } else {
        height = groupCoordinate.height! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, -1]}, true);
}

/**
 * 以顶部为基准向下扩大
 */
export const doBaseUpEnlargeDown = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        height = layerConfigs[id].height! + resizeStep;
    } else {
        height = groupCoordinate.height! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, 1]}, true);
}

/**
 * 以右边为基准向左扩大
 */
export const doBaseRightEnlargeLeft = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! + resizeStep;
    } else {
        width = groupCoordinate.width! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [-1, 1]}, true);
}

/**
 * 以左边为基准向右扩大
 */
export const doBaseLeftEnlargeRight = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! + resizeStep;
    } else {
        width = groupCoordinate.width! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [1, 1]}, true);
}


/**
 * 以底部为基准向上缩小
 */
export const doBaseBottomDecreaseUp = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        height = layerConfigs[targetIds[0]].height! - resizeStep;
    } else {
        height = groupCoordinate.height! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, -1]}, true);
}

/**
 * 以顶部为基准向下缩小
 */
export const doBaseUpDecreaseDown = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        height = layerConfigs[id].height! - resizeStep;
    } else {
        height = groupCoordinate.height! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, 1]}, true);
}

/**
 * 以右边为基准向左缩小
 */
export const doBaseRightDecreaseLeft = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! - resizeStep;
    } else {
        width = groupCoordinate.width! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [-1, 1]}, true);
}

/**
 * 以左边为基准向右缩小
 */
export const doBaseLeftDecreaseRight = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const {layerManager, canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const {layerConfigs} = layerManager;
    const {canvasConfig: {resizeStep = 1}} = canvasManager!;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! - resizeStep;
    } else {
        width = groupCoordinate.width! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [1, 1]}, true);
}

/**
 * 组内左对齐
 */
export const groupLeftAligned = selectionCommands.groupLeftAligned;

/**
 * 组内右对齐
 */
export const groupRightAligned = selectionCommands.groupRightAligned;

/**
 * 组内上对齐
 */
export const groupTopAligned = selectionCommands.groupTopAligned;

/**
 * 组内下对齐
 */
export const groupBottomAligned = selectionCommands.groupBottomAligned;

/**
 * 撤销
 */
export const undo = () => {
    const history = historyOperator.backoff();
    if (!history) return;
    const {actions} = history!;
    actions.forEach(action => {
        const {type} = action!;
        undoRedoMap.get(type)?.undo(action!);
    })
}

/**
 * 重做
 */
export const redo = () => {
    const history = historyOperator.forward();
    if (!history) return;
    const {actions} = history!;
    actions.forEach(action => {
        const {type} = action!;
        undoRedoMap.get(type)?.redo(action!);
    });
}


/*************************运行时配置快捷键*************************/

/**
 * 切换辅助线展示
 */
export const toggleSecondaryBorder = () => {
    const {auxiliaryBorder, setAuxiliaryBorder} = runtimeConfigStore;
    const newValue = !auxiliaryBorder;
    if (newValue) {
        //展示辅助线
        const compContainers = document.getElementsByClassName('datavisool-comp-item')
        compContainers && Array.from(compContainers).forEach((compContainer: Element) => {
            (compContainer as HTMLElement).style.border = '1px solid #65eafc';
        });
    } else {
        //隐藏辅助线
        const compContainers = document.getElementsByClassName('datavisool-comp-item')
        compContainers && Array.from(compContainers).forEach((compContainer: Element) => {
            (compContainer as HTMLElement).style.border = 'none';
        });
    }
    setAuxiliaryBorder(!auxiliaryBorder);
}

/**
 * 切换项目设置弹框
 */
export const toggleProjectConfig = () => {
    const {currentKey, setCurrentKey} = designerHeaderStore;
    if (currentKey === 'project')
        setCurrentKey('')
    else
        setCurrentKey('project')
}

/**
 * 切换画布设置弹框
 */
export const toggleCanvasConfig = () => {
    const {currentKey, setCurrentKey} = designerHeaderStore;
    if (currentKey === 'canvas')
        setCurrentKey('')
    else
        setCurrentKey('canvas')
}

/**
 * 切换全局主题设置弹框
 */
export const toggleGlobalThemeConfig = () => {
    const {currentKey, setCurrentKey} = designerHeaderStore;
    if (currentKey === 'theme')
        setCurrentKey('')
    else
        setCurrentKey('theme')
}

/**
 * 切换快捷键设置弹框
 */
export const toggleHotKeyDes = () => {
    const {hotKeyVisible, setHotKeyVisible} = footerStore;
    setHotKeyVisible(!hotKeyVisible)
}

export const exportProject = () => {
    globalMessage.messageApi?.open({
        key: 'exportProject',
        type: 'loading',
        content: '正在导出项目数据，需要一些时间，请耐心等候...',
        duration: 0,
    })
    const timeout = setTimeout(() => {
        void performProjectExport();
        clearTimeout(timeout);
    }, 1000);
}

const performProjectExport = async () => {
    try {
        const managerData = managerStore.currentFinalManager!.getData();
        const dependency = await ProjectUtil.calculateProjectGraphDependency(window.DATAVISOOL_ENV.projectId, managerData, {
            entryProjectName: document.title
        });
        const entryProject = dependency.projects.find((item) => item.isEntry);
        const exportPayload = {
            ...dependency,
            projectJson: entryProject?.projectJson
                ? ProjectDataCodecUtil.compressIfBeneficial(entryProject.projectJson)
                : undefined,
            projects: dependency.projects.map((item) => ({
                ...item,
                projectJson: ProjectDataCodecUtil.compressIfBeneficial(item.projectJson)
            }))
        };
        const packageEncryptionRequired = dependency.commonApiIds.length > 0 || dependency.databaseIds.length > 0;
        const exportSecretPayload = await confirmExportSecretOptions(packageEncryptionRequired);
        if (!exportSecretPayload) {
            return;
        }
        const finalExportPayload = {...exportPayload, ...exportSecretPayload};

        const riskWarnings = [
            ...(await collectCommonApiExportRiskWarnings(dependency.commonApiIds)),
            ...(await collectDatabaseExportRiskWarnings(dependency.databaseIds)),
        ];
        if (!(await confirmExportRiskWarnings(riskWarnings, finalExportPayload.secretMode))) {
            return;
        }

        const res = await AuthFetchUtil.post<Blob>('/api/export/exportProject', finalExportPayload);
        if (res !== null) {
            const url = URL.createObjectURL(res);
            const a = document.createElement('a')
            a.href = url;
            a.download = `${document.title}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            globalMessage.messageApi?.success('项目数据导出成功');
        }
    } catch (error: any) {
        if (error instanceof ProjectGraphCycleError) {
            globalMessage.messageApi?.error(error.message);
        } else {
            globalMessage.messageApi?.error(error?.message || '项目导出失败');
        }
    } finally {
        globalMessage.messageApi?.destroy("exportProject");
    }
}
const confirmExportSecretOptions = async (packageEncryptionRequired: boolean = false) => {
    const modalApi = globalModal.modalApi;
    if (!modalApi)
        return packageEncryptionRequired ? null : ExportSecretUtil.buildExportSecretPayload(false);

    return await new Promise<ReturnType<typeof ExportSecretUtil.buildExportSecretPayload> | null>((resolve) => {
        let settled = false;
        let formValues = {encryptPackage: true, secretPassphrase: '', confirmSecretPassphrase: ''};
        let setFormErrors: ((errors: { secretPassphraseErrors: string[], confirmSecretPassphraseErrors: string[] }) => void) | null = null;

        const finish = (result: ReturnType<typeof ExportSecretUtil.buildExportSecretPayload> | null) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };

        modalApi.confirm({
            title: '导出选项',
            okText: '下一步',
            cancelText: '取消',
            icon: null,
            content: createElement(() => {
                const [values, setValues] = useState(formValues);
                const [errors, setErrors] = useState({secretPassphraseErrors: [] as string[], confirmSecretPassphraseErrors: [] as string[]});
                setFormErrors = setErrors;
                const updateValues = (next: typeof formValues) => {
                    formValues = next;
                    setValues(next);
                };

                return createElement('div', {
                    style: {display: 'grid', gap: '12px', marginTop: '16px'}
                }, [
                    createElement(CheckBox, {
                        key: 'encryptPackage',
                        value: values.encryptPackage,
                        disabled: packageEncryptionRequired,
                        helperText: packageEncryptionRequired ? '当前项目包含公共 API 或数据库，必须启用整包加密' : undefined,
                        onChange: (value: boolean) => updateValues({...values, encryptPackage: value}),
                    }, '整包加密'),
                    values.encryptPackage ? createElement('div', {
                        key: 'secretFieldsContainer',
                        style: {display: 'grid', gap: '12px'}
                    }, [
                        createElement('label', {
                            key: 'secretPassphrase',
                            style: {display: 'grid', gap: '8px'}
                        }, [
                            createElement('span', {key: 'label'}, '导出口令'),
                            createElement(Input, {
                            key: 'input',
                            type: 'password',
                            value: values.secretPassphrase,
                            placeholder: '请输入导出口令',
                            autoComplete: 'new-password',
                            status: errors.secretPassphraseErrors.length > 0 ? 'error' : 'default',
                            onChange: (value: string) => updateValues({...values, secretPassphrase: value}),
                        }),
                            errors.secretPassphraseErrors.length > 0 ? createElement('span', {
                                key: 'error',
                                style: {color: '#ff8f8f', fontSize: 12}
                            }, errors.secretPassphraseErrors.join('、')) : null,
                        ]),
                        createElement('label', {
                            key: 'confirmSecretPassphrase',
                            style: {display: 'grid', gap: '8px'}
                        }, [
                            createElement('span', {key: 'label'}, '确认口令'),
                            createElement(Input, {
                            key: 'input',
                            type: 'password',
                            value: values.confirmSecretPassphrase,
                            placeholder: '请再次输入导出口令',
                            autoComplete: 'new-password',
                            status: errors.confirmSecretPassphraseErrors.length > 0 ? 'error' : 'default',
                            onChange: (value: string) => updateValues({...values, confirmSecretPassphrase: value}),
                        }),
                            errors.confirmSecretPassphraseErrors.length > 0 ? createElement('span', {
                                key: 'error',
                                style: {color: '#ff8f8f', fontSize: 12}
                            }, errors.confirmSecretPassphraseErrors.join('、')) : null,
                        ])
                    ]) : null,
                    createElement('div', {
                        key: 'hint',
                        style: {color: 'rgba(255,255,255,0.65)', lineHeight: '22px'}
                    }, '启用后将按桌面端兼容格式加密整个项目包')
                ]);
            }),
            onOk: async () => {
                const encryptPackage = packageEncryptionRequired || formValues.encryptPackage;
                const validationResult = ExportSecretUtil.validateExportSecretForm({...formValues, encryptPackage});
                setFormErrors?.(validationResult);
                if (validationResult.secretPassphraseErrors.length > 0 || validationResult.confirmSecretPassphraseErrors.length > 0)
                    return Promise.reject(new Error('export secret form validation failed'));

                finish(ExportSecretUtil.buildExportSecretPayload(encryptPackage, formValues.secretPassphrase ?? ''));
                return true;
            },
            onCancel: () => finish(null),
            afterClose: () => finish(null),
        });
    });
}

const collectCommonApiExportRiskWarnings = async (commonApiIds: string[]) => {
    if (commonApiIds.length === 0)
        return [] as string[];

    const definitions = await Promise.all(commonApiIds.map(async (id) => {
        try {
            const response = await AuthFetchUtil.get<any>(`/api/commonApi/getCommonApi/${id}`);
            if (!response)
                return null;
            return {
                id,
                name: response.name,
                headers: response.headers,
            };
        } catch {
            return null;
        }
    }));

    return ExportRiskUtil.buildCommonApiHeaderRiskWarnings(definitions.filter(item => item != null));
}

const collectDatabaseExportRiskWarnings = async (databaseIds: string[]) => {
    if (databaseIds.length === 0)
        return [] as string[];

    const clientKey = HybridCryptoUtil.getClientPublicKey();
    const definitions = await Promise.all(databaseIds.map(async (id) => {
        try {
            const response = await AuthFetchUtil.post<EncryptResult>('/api/commonDatabase/get', {id, key: clientKey});
            if (!response)
                return null;
            const decrypted = HybridCryptoUtil.decryptResponse(response);
            const data = JSON.parse(decrypted as string);
            return {
                id,
                name: data.name,
                password: data.password,
            };
        } catch {
            return null;
        }
    }));

    return ExportRiskUtil.buildDatabasePasswordRiskWarnings(definitions.filter(item => item != null));
}

const confirmExportRiskWarnings = async (warnings: string[], secretMode: ExportSecretMode) => {
    if (warnings.length === 0)
        return true;
    const modalApi = globalModal.modalApi;
    if (!modalApi)
        return true;

    return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (result: boolean) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };

        const content = createElement('div', {
            style: {whiteSpace: 'pre-wrap'}
        }, ExportSecretUtil.buildExportRiskWarningMessage(warnings, secretMode));

        modalApi.confirm({
            title: '导出风险提示',
            content,
            okText: '继续导出',
            cancelText: '取消',
            onOk: () => finish(true),
            onCancel: () => finish(false),
            afterClose: () => finish(false),
        });
    });
}

const requestImportSecretPassphrase = async () => {
    const modalApi = globalModal.modalApi;
    if (!modalApi)
        return '';

    return await new Promise<string | null>((resolve) => {
        let settled = false;
        let secretPassphrase = '';
        const finish = (result: string | null) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };

        modalApi.confirm({
            title: '导入项目',
            okText: '开始导入',
            cancelText: '取消',
            icon: null,
            content: createElement(() => {
                return createElement('div', {style: {marginTop: '16px'}}, [
                    createElement('label', {
                        key: 'secretPassphrase',
                        style: {display: 'grid', gap: '8px', marginBottom: '12px'}
                    }, [
                        createElement('span', {key: 'label'}, '导入口令（选填）'),
                        createElement(Input, {
                            key: 'input',
                            type: 'password',
                            placeholder: '若项目包已加密或包含加密数据源，请输入导入口令',
                            autoComplete: 'new-password',
                            onChange: (value: string) => {
                                secretPassphrase = value;
                            },
                        })
                    ]),
                    createElement('div', {
                        key: 'hint',
                        style: {color: 'rgba(255,255,255,0.65)', lineHeight: '22px'}
                    }, '明文包可直接留空；若项目包已加密或包含加密数据源，则需要填写正确的导入口令。')
                ]);
            }),
            onOk: async () => {
                finish(secretPassphrase.trim());
                return true;
            },
            onCancel: () => finish(null),
            afterClose: () => finish(null),
        });
    });
}

export const importProject = () => {
    //打开文件选择框
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e: any) => {
        const file = e.target.files[0] as File;
        if (!file)
            return;
        const secretPassphrase = await requestImportSecretPassphrase();
        if (secretPassphrase === null)
            return;

        const currFinalManager = managerStore.currentFinalManager;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', currFinalManager?.id ?? '');
        formData.append('secretPassphrase', secretPassphrase);
        let importNotice = '';
        AuthFetchUtil.post<boolean>('/api/import/importProject', formData, {
            headers: {'Content-Type': 'multipart/form-data'},
            loadingText: '正在导入项目数据...',
            onSuccess: response => { if (response.msg !== '操作成功') importNotice = response.msg || ''; }
        }).then((res) => {
            if (res === true) showProjectImportSuccess(importNotice);
        })
    }
    input.click();
}

export const searchLayer = () => {
    const {searchLayer, setSearchLayer} = layerListStore;
    setSearchLayer(!searchLayer);
}

export const saveAsTemplate = () => {
    const targetIds = selectionCommands.resolveSelectedCommandTargetIds();
    if (!targetIds || targetIds.length === 0)
        return;
    //筛选出图层和组件配置
    const template: { layers: { [key: string]: ILayerItem }, configs: { [key: string]: any } } = {
        layers: {},
        configs: {}
    };
    const {layerConfigs, controllers} = window.DATAVISOOL_ENV.currentManager.layerManager;
    //计算基准坐标
    const baseCoordinate = CoordinateUtil.calculateGroupRectLT(targetIds, layerConfigs);
    targetIds.forEach(id => {
        let layer = layerConfigs[id];
        if (layer) {
            layer = cloneDeep(layer);
            if (layer.type !== 'group') {
                //计算相对位置
                const {minX, minY} = baseCoordinate;
                layer.x = layer.x! - minX;
                layer.y = layer.y! - minY;
            }
            layer.lock = false;
            template['layers'][id] = layer;
        }
        const controller = controllers[id];
        if (controller)
            template['configs'][id] = controller.getConfig();
    });
    let formValues: { name: string, description: string, coverFile: File | null } = {name: '', description: '', coverFile: null};
    let setNameError: ((error: string) => void) | null = null;
    globalModal.modalApi?.confirm({
        title: '存为模板',
        content: createElement(() => {
            const [values, setValues] = useState(formValues);
            const [error, setError] = useState('');
            setNameError = setError;
            const updateValues = (next: typeof formValues) => {
                formValues = next;
                setValues(next);
                if (next.name.trim())
                    setError('');
            };

            return createElement('div', {
                style: {display: 'grid', gap: '12px', marginTop: '16px'}
            }, [
                createElement('label', {
                    key: 'name',
                    style: {display: 'grid', gap: '8px'}
                }, [
                    createElement('span', {key: 'label'}, '模板名称'),
                    createElement(Input, {
                        key: 'input',
                        value: values.name,
                        placeholder: '请输入模板名称',
                        status: error ? 'error' : 'default',
                        onChange: (value: string) => updateValues({...values, name: value}),
                    }),
                    error ? createElement('span', {
                        key: 'error',
                        style: {color: '#ff8f8f', fontSize: 12}
                    }, error) : null,
                ]),

                createElement('label', {
                    key: 'description',
                    style: {display: 'grid', gap: '8px'}
                }, [
                    createElement('span', {key: 'label'}, '模板描述'),
                    createElement(TextArea, {
                        key: 'textarea',
                        value: values.description,
                        placeholder: '请输入模板描述',
                        rows: 3,
                        onChange: (value: string) => updateValues({...values, description: value}),
                    }),
                ]),

                createElement('label', {
                    key: 'coverFile',
                    style: {display: 'grid', gap: '8px'}
                }, [
                    createElement('span', {key: 'label'}, '封面图'),
                    createElement('input', {
                        key: 'input',
                        type: 'file',
                        accept: 'image/*',
                        onChange: (event: any) => {
                            updateValues({...values, coverFile: event.target.files?.[0] ?? null});
                        }
                    }),
                    values.coverFile ? createElement('span', {
                        key: 'fileName',
                        style: {color: 'rgba(255,255,255,0.65)', fontSize: 12}
                    }, values.coverFile.name) : null,
                ])
            ]);
        }),
        okText: '确定',
        cancelText: '取消',
        icon: null,
        onOk: async () => {
            if (!formValues.name.trim()) {
                setNameError?.('请输入模板名称');
                return Promise.reject(new Error('template name is required'));
            }
            try {
                // 构建表单数据
                const formData = new FormData();
                formData.append('name', formValues.name.trim());
                formData.append('description', formValues.description || '');
                if (formValues.coverFile)
                    formData.append('coverFile', formValues.coverFile);
                formData.append('templateJson', JSON.stringify(template));
                await baseApi.createTemplate(formData);
                window.dispatchEvent(new CustomEvent('datavisool-template-created'));
                globalMessage.messageApi?.success('操作成功');
                return true;
            } catch (error) {
                console.log('表单验证失败:', error);
                return false; // 返回false阻止关闭
            }
        }
    });

}

export const createLoopContainer = () => {
    historyRecordOperateProxy.createLoopContainer();
}

/**
 * 编辑循环容器
 * @param layerId
 */
export const editLoopContainer = (layerId: string) => {
    if (!layerId)
        return;
    const {layerManager: {controllers}} = window.DATAVISOOL_ENV.currentManager;
    const controller = controllers[layerId];
    if (!controller)
        return;
    if (window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT)
        return;
    if (typeof (controller as any).seedEditSampleData === 'function')
        (controller as any).seedEditSampleData();
    const {setTargetIds} = eventOperateStore;
    setTargetIds([]);
    const currentManager = (controller as any).manager;
    managerStore.pushManager(currentManager)
    window.DATAVISOOL_ENV.currentManager = currentManager;
    managerStore.setCurrentManager(currentManager, false, DesignerScene.LOOP_CONTAINER);
    const timer = setTimeout(() => {
        window.DATAVISOOL_ENV?.dragScaleProvider?.reset();
        window.DATAVISOOL_ENV?.historyOperator?.reset();
        rightStore.activeConfig(null, '');
        clearTimeout(timer);
    }, 10)
}

/**
 * 返回主项目
 */
export const returnPrevProject = () => {
    const {setTargetIds} = eventOperateStore;
    setTargetIds([]);
    if (managerStore.managerStack.length <= 1)
        return;
    managerStore.popManager();
    const manager = managerStore.managerStack[managerStore.managerStack.length - 1];
    if (!manager)
        return;
    window.DATAVISOOL_ENV.currentManager = manager;
    managerStore.setCurrentManager(manager, manager.scene === DesignerScene.DEFAULT, manager.scene ?? DesignerScene.DEFAULT);
    const timer = setTimeout(() => {
        window.DATAVISOOL_ENV?.dragScaleProvider?.reset();
        window.DATAVISOOL_ENV?.historyOperator?.reset();
        rightStore.activeConfig(null, '');
        clearTimeout(timer);
    }, 10)
}

/*************************蓝图快捷键实现*************************/

/**
 * 删除蓝图中选中的节点
 */
export const delBPNode = () => {
    if (designerHeaderStore.currentKey !== 'blue-print') return;
    const {selectedNodes, selectedNodeIds} = window.DATAVISOOL_ENV.currentManager.bluePrintManager!;
    if (selectedNodes.length === 0)
        return;
    bpHistoryRecordOperateProxy.doDelNodes(selectedNodeIds);
}

/**
 * 删除蓝图中选中的连线
 */
export const delBPLine = () => {
    if (designerHeaderStore.currentKey !== 'blue-print') return;
    const {selectedLines, selectedNodeIds} = window.DATAVISOOL_ENV.currentManager.bluePrintManager!;
    if (selectedNodeIds.length > 0)
        return;
    if (selectedLines.length === 0)
        return;
    bpHistoryRecordOperateProxy.doDelLines(selectedLines);
}
