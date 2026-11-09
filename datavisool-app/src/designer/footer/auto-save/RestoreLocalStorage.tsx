/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Button, Dialog, Tag} from "@datavisool/ui";
import {Attention, CheckSmall, DatabaseTime, History, SaveOne, Time} from "@icon-park/react";
import {useEffect, useState} from 'react';
import './RestoreLocalStorage.less';
import {restoreAutoSave} from "./AutoSaveManager.ts";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import managerStore from "@/designer/manager/ManagerStore.ts";
import rightStore from "@/designer/right/RightStore.ts";
import {globalMessage} from "@datavisool/ui";
import {observer} from "mobx-react";
import footerStore from "@/designer/footer/FooterStore.ts";
import ProjectDataCodecUtil from "@/util/ProjectDataCodecUtil.ts";


interface ILocalStorageData {
    content: string,
    meta: Record<string, any>,
    saveTime: number
}

const RestoreLocalStorage = observer(() => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [data, setData] = useState<ILocalStorageData[]>([]);
    const {snapshotRecoveryVisible, setSnapshotRecoveryVisible} = footerStore;
    const hasErr = localStorage.getItem(`PROJECT_ERROR_${window.DATAVISOOL_ENV.projectId}`) === '1';
    const selectedSnapshot = selectedIndex !== null ? data[selectedIndex] : null;
    const latestSaveTime = data[0]?.saveTime;

    const formatSaveTime = (saveTime: number) => {
        return new Date(saveTime).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }

    useEffect(() => {
        setSelectedIndex(null);
        if (snapshotRecoveryVisible) {
            restoreAutoSave(`DATAVISOOL_${window.DATAVISOOL_ENV.projectId}`).then((list: ILocalStorageData[]) => {
                setData(list.sort((a, b) => b.saveTime - a.saveTime));
            })
        }
    }, [snapshotRecoveryVisible]);

    // 恢复选中的那条
    const handleRestore = () => {
        if (selectedIndex !== null) {
            const datum = data[selectedIndex];
            if (!datum)
                return;
            const {id, name} = datum.meta;
            if (!datum?.content) {
                globalMessage.messageApi?.error('备份数据错误，无法恢复')
                return;
            }
            const contentObj = JSON.parse(datum.content);
            if (!contentObj)
                return;
            globalMessage.messageApi?.open({
                type: 'info',
                content: '正在恢复项目，请稍候...',
                key: 'restoring',
            })
            window.DATAVISOOL_ENV.editorLoader.setLoaded(false)
            const decoded = ProjectDataCodecUtil.decompressIfNeeded(contentObj.dataJson);
            const managerData = JSON.parse(decoded);
            const designerManager = new DesignerManager(DesignerScene.DEFAULT);
            const {setTargetIds} = eventOperateStore;
            setTargetIds([]);

            managerData.id = id;
            managerData.name = name;
            designerManager.init(managerData, DesignerMode.EDIT);
            window.DATAVISOOL_ENV.currentManager = designerManager;
            managerStore.resetManagerStack(designerManager, true, DesignerScene.DEFAULT);
            const timer = setTimeout(() => {
                window.DATAVISOOL_ENV?.dragScaleProvider?.reset();
                window.DATAVISOOL_ENV?.historyOperator?.reset();
                rightStore.activeConfig(null, '');
                clearTimeout(timer);
                globalMessage.messageApi?.destroy("restoring");
                globalMessage.messageApi?.success('项目已恢复')
                window.DATAVISOOL_ENV.editorLoader.setLoaded(true)
            }, 1500)
        }
        localStorage.removeItem(`PROJECT_ERROR_${window.DATAVISOOL_ENV.projectId}`);
        setSnapshotRecoveryVisible(false);
    };

    return (
        <Dialog title={<div className="restore-title">
            <span className="restore-title-icon" aria-hidden="true">
                <DatabaseTime size={20} strokeWidth={1.75}/>
            </span>
            <span className="restore-title-copy">
                <span className="restore-title-main">{hasErr ? '错误快照恢复' : "本地快照恢复"}</span>
                <span className="restore-title-sub">从本地自动保存记录中恢复当前项目</span>
            </span>
        </div>}
                open={snapshotRecoveryVisible}
                onClose={() => {
                    setSnapshotRecoveryVisible(false);
                    localStorage.removeItem(`PROJECT_ERROR_${window.DATAVISOOL_ENV.projectId}`);
                }}
                centered
                mask
                showClose
                width={720}
                height="min(720px, calc(100dvh - 32px))"
                className="restore-local-storage-modal">
            <div className="restore-modal-content">
                <div className="restore-modal-main">
                    {hasErr && (
                        <div className="restore-notice" role="status">
                            <Attention size={18} strokeWidth={1.75} aria-hidden="true"/>
                            <div className="restore-notice-copy">
                                <span className="restore-notice-title">检测到项目异常</span>
                                <span>请选择错误前的可用快照，点击“恢复”还原项目。</span>
                            </div>
                        </div>
                    )}

                    <div className="restore-section">
                        <div className="restore-section-heading">
                            <div className="restore-section-title">
                                <History size={18} strokeWidth={1.75} aria-hidden="true"/>
                                <span>快照列表</span>
                                <Tag bordered={false}>{data.length} 条</Tag>
                            </div>
                            <span className="restore-latest-save">
                                最新保存 {latestSaveTime ? formatSaveTime(latestSaveTime) : '-'}
                            </span>
                        </div>

                        <div className="restore-list-container" role="group" aria-label="选择要恢复的快照">
                            {data.length === 0 && (
                                <div className="restore-empty-state">
                                    <History size={32} strokeWidth={1.5} aria-hidden="true"/>
                                    <span className="restore-empty-title">暂无本地快照</span>
                                    <span>当前没有可恢复的本地快照。</span>
                                </div>
                            )}

                            {data.map((item, index) => {
                                const diffInMinutes = Math.floor((Date.now() - item.saveTime) / (1000 * 60));
                                const isWarning = diffInMinutes > 60;
                                const isSelected = selectedIndex === index;

                                return (
                                    <button
                                        type="button"
                                        key={item.saveTime + '-' + index}
                                        className={
                                            `restore-list-item ` + (isSelected ? 'restore-list-item-selected' : '')
                                        }
                                        aria-pressed={isSelected}
                                        onClick={() => setSelectedIndex(index)}
                                    >
                                        <span className="restore-item-select" aria-hidden="true">
                                            {isSelected && <CheckSmall size={14} strokeWidth={1.75}/>}
                                        </span>

                                        <span className="restore-item-main">
                                            <span className="restore-item-line">
                                                <span className="restore-item-name" title={item.meta.name}>{item.meta.name}</span>

                                                <span
                                                    className={
                                                        `restore-item-time ` +
                                                        (isWarning ? 'restore-item-time-warning' : 'restore-item-time-normal')
                                                    }
                                                >
                                                    {diffInMinutes} 分钟前
                                                </span>
                                            </span>
                                            <span className="restore-item-meta">
                                                <span>
                                                    <SaveOne size={14} strokeWidth={1.75} aria-hidden="true"/>
                                                    自动保存
                                                </span>
                                                <span>
                                                    <Time size={14} strokeWidth={1.75} aria-hidden="true"/>
                                                    {formatSaveTime(item.saveTime)}
                                                </span>
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="restore-modal-footer">
                    <div className="restore-selection" aria-live="polite">
                        <span className="restore-selection-label">{selectedSnapshot ? '已选择快照' : '未选择快照'}</span>
                        <span className="restore-selection-value" title={selectedSnapshot?.meta?.name}>
                            {selectedSnapshot ? `${selectedSnapshot.meta.name || '未命名项目'} · ${formatSaveTime(selectedSnapshot.saveTime)}` : '请先在列表中选择一个版本'}
                        </span>
                    </div>
                    <div className="restore-footer-actions">
                        <Button onClick={() => {
                            setSnapshotRecoveryVisible(false);
                            localStorage.removeItem(`PROJECT_ERROR_${window.DATAVISOOL_ENV.projectId}`);
                        }} type="default" className="restore-cancel-btn">
                            取消
                        </Button>
                        <Button
                            type="primary"
                            className="restore-confirm-btn"
                            disabled={selectedIndex === null}
                            onClick={handleRestore}>
                            恢复
                        </Button>
                    </div>
                </div>
            </div>
        </Dialog>
    );
})

export default RestoreLocalStorage;
