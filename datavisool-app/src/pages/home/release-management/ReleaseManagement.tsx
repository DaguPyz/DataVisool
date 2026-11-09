/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Button, Empty, Input, Pagination, Switch} from "@datavisool/ui";
import {Delete, Edit, Lock, PreviewOpen, Search, Send, Sort, Unlock} from "@icon-park/react";
import {useEffect, useState} from "react";
import type {KeyboardEvent} from "react";
import {globalModal} from "@datavisool/ui";
import {globalMessage} from "@datavisool/ui";
import {observer} from "mobx-react";
import releaseStore, {IReleaseProjectItem} from "@/pages/home/release-management/ReleaseStore.ts";
import ReleaseEditPanel from "@/pages/home/release-management/ReleaseEditPanel.tsx";
import {Base64Util} from "@datavisool/sdk";
import styles from "@/pages/home/release-management/ReleaseManagement.module.less";
import {withDesktopWebviewUserAgent} from "@/util/WebviewUserAgentUtil.ts";
import {isTauriRuntime, openDesktopWebview} from "@/util/TauriCompatUtil.ts";
import waveThumb from "@/pages/home/release-management/assets/release-thumb-wave.webp";
import docThumb from "@/pages/home/release-management/assets/release-thumb-doc.webp";
import bottomWave from "@/pages/home/release-management/assets/release-bottom-wave.webp";
import {tx} from "@/i18n/miniI18n.ts";

const formatExpiration = (expirationDate?: number) => {
    return expirationDate ? `${expirationDate} 天` : "永久";
};

const getDescription = (record: IReleaseProjectItem) => {
    return record.description?.trim() || record.des?.trim() || "未填写项目描述";
};

const ReleaseManagement = observer(() => {
    const {pageData} = releaseStore;
    const {records, current, size, total} = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [releaseStates, setReleaseStates] = useState<Record<string, boolean>>({});

    useEffect(() => {
        releaseStore.init();
        return () => releaseStore.destroy();
    }, []);

    const isAllSelected = records.length > 0 && records.every(item => selectedIds.includes(item.id!));

    const doSearch = (value?: string) => {
        releaseStore.searchValue = value ?? "";
        releaseStore.getList();
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter") return;
        doSearch((event.target as HTMLInputElement).value);
    };

    const toggleSelection = (id?: string) => {
        if (!id) return;
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (isAllSelected) {
            setSelectedIds([]);
            return;
        }
        setSelectedIds(records.map(item => item.id!).filter(Boolean));
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的项目"));
            return;
        }
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的发布项目吗？删除后无法恢复，请谨慎操作！"),
            onOk: () => {
                releaseStore.doBatchDelete(selectedIds);
                setSelectedIds([]);
            },
            okText: tx("确定"),
            cancelText: tx("取消"),
        });
    };

    const handleDelete = (id?: string) => {
        if (!id) return;
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除已发布的项目嘛？删除后无法恢复，请谨慎操作！"),
            onOk: () => releaseStore.doBatchDelete([id]),
            okText: tx("确定"),
            cancelText: tx("取消"),
        });
    };

    const handlePreview = (id?: string) => {
        if (!id) return;
        const code = Base64Util.toBase64(id);
        const isTauri = isTauriRuntime();
        if (isTauri) {
            void openDesktopWebview(`release-${id}`, withDesktopWebviewUserAgent({
                url: `/release/${code}`,
                title: "DataVisool Release",
                decorations: false,
                fullscreen: true
            }));
        } else {
            window.open(`/release/${code}`, "_blank");
        }
    };

    return (
        <div className={styles.releasePage}>
            <div className={styles.header}>
                <div className={styles.titleGroup}>
                    <span className={styles.titleIcon} aria-hidden="true">
                        <Send theme="outline" size={24} fill="currentColor" />
                    </span>
                    <div>
                        <h1>{"发布管理"}</h1>
                        <p>{"统一管理和发布系统中的项目，确保稳定交付与高效协作"}</p>
                    </div>
                </div>
                <div className={styles.toolbar}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder={"搜索已发布项目"}
                        prefix={<Search size={20} color={"#A9B7D9"}/>}
                        onKeyDown={onSearchKeyDown}
                        onPressEnter={(e) => doSearch((e.target as HTMLInputElement).value)}
                    />
                    <Button className={styles.batchDeleteButton} type="default" onClick={handleBatchDelete}>
                        <Delete size={18}/>
                        {"删除"}
                    </Button>
                </div>
            </div>

            <section className={styles.tablePanel}>
                <div className={styles.tableScroll}>
                    <div className={`${styles.tableRow} ${styles.tableHead}`}>
                        <button
                            className={`${styles.checkbox} ${isAllSelected ? styles.checkboxChecked : ""}`}
                            onClick={toggleAll}
                            aria-label="全选"
                        />
                        <div className={styles.nameColumn}>{"名称"}</div>
                        <div className={styles.dateColumn}>
                            {"发布时间"}
                            <Sort size={14}/>
                        </div>
                        <div>{"有效期"}</div>
                        <div>{"加密状态"}</div>
                        <div>{"发布状态"}</div>
                        <div>{"操作"}</div>
                    </div>

                    <div className={styles.tableBody}>
                        {records.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Empty title={null} description="暂无发布项目"/>
                            </div>
                        ) : records.map((record, index) => {
                            const id = record.id;
                            const checked = selectedIds.includes(id!);
                            const encrypted = !!record.encrypt;
                            const publishing = id ? releaseStates[id] ?? !!record.state : !!record.state;
                            const thumb = index % 2 === 0 ? waveThumb : docThumb;
                            return (
                                <div className={styles.tableRow} key={id}>
                                    <button
                                        className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}
                                        onClick={() => toggleSelection(id)}
                                        aria-label="选择项目"
                                    />
                                    <div className={styles.projectCell}>
                                        <img className={styles.projectThumb} src={thumb} alt=""/>
                                        <div className={styles.projectMeta}>
                                            <div className={styles.projectName} title={record.name} data-datavisool-i18n-skip={record.name?.trim() ? "true" : undefined}>{record.name || tx("未命名项目")}</div>
                                            <div className={styles.projectDesc} title={getDescription(record)} data-datavisool-i18n-skip={(record.description?.trim() || record.des?.trim()) ? "true" : undefined}>{getDescription(record)}</div>
                                        </div>
                                    </div>
                                    <div className={styles.timeText}>{record.updateTime || "--"}</div>
                                    <div>
                                        <span className={styles.expirationBadge}>{formatExpiration(record.expirationDate)}</span>
                                    </div>
                                    <div>
                                        <span className={`${styles.encryptBadge} ${encrypted ? styles.encrypted : styles.unencrypted}`}>
                                            {encrypted ? <Lock size={16}/> : <Unlock size={16}/>}
                                            {encrypted ? "已加密" : "未加密"}
                                        </span>
                                    </div>
                                    <div className={styles.publishCell}>
                                        <span className={styles.publishText}>{publishing ? "发布中" : "已停用"}</span>
                                        <Switch
                                            controlClassName={styles.publishSwitch}
                                            switchSize="sm"
                                            value={publishing}
                                            onChange={(checked) => {
                                                if (!record.id) return;
                                                setReleaseStates(prev => ({...prev, [record.id!]: checked}));
                                                releaseStore.updateReleaseState(record.id, checked);
                                            }}
                                        />
                                    </div>
                                    <div className={styles.actionGroup}>
                                        <button
                                            className={styles.actionButton}
                                            onClick={() => {
                                                releaseStore.setCurrentItem(record);
                                                releaseStore.setModalVisible(true);
                                            }}
                                        >
                                            <Edit size={16}/>
                                            {"编辑"}
                                        </button>
                                        <button className={styles.actionButton} onClick={() => handlePreview(id)}>
                                            <PreviewOpen size={17}/>
                                            {"查看发布"}
                                        </button>
                                        <button className={`${styles.actionButton} ${styles.dangerAction}`} onClick={() => handleDelete(id)}>
                                            <Delete size={16}/>
                                            {"删除"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.paginationBar}>
                    <Pagination
                        current={current}
                        pageSize={size}
                        total={total}
                        showSizeChanger={false}
                        showTotal={(count, range) => `第 ${range[0]}-${range[1]} 条，共 ${count} 条`}
                        controlClassName={styles.pagination}
                        onChange={(page) => {
                            setSelectedIds([]);
                            releaseStore.changeCurrentPage(page);
                        }}
                    />
                </div>
            </section>

            <img className={styles.bottomWave} src={bottomWave} alt=""/>
            {releaseStore.modalVisible && <ReleaseEditPanel/>}
        </div>
    );
});

export default ReleaseManagement;
