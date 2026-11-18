/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useWorkbenchLocale, type WorkbenchPageServices} from "@/shared/workbench/pageServices.ts";
import {useEffect, useState} from "react";
import type {MouseEvent} from "react";
import {observer} from "mobx-react";
import {Api, Copy, Delete, Edit, LinkOne, Plus, Search} from "@icon-park/react";
import {globalMessage} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import {ApiManagementStore, type ICommonApi} from "./ApiManagementStore.ts";
import ApiEditPanel from "./ApiEditPanel.tsx";
import styles from "./ApiManagement.module.less";
import {Button, Input, Pagination} from "@datavisool/ui";
import usersIcon from "./assets/api-users-icon.webp";
import vehicleIcon from "./assets/api-vehicle-icon.webp";
import bottomWave from "./assets/api-bottom-wave.webp";

type ApiCardTone = "users" | "vehicle";

const vehicleNamePattern = /(车|车辆|汽车|轨迹|fleet|vehicle|car)/i;

const getMethod = (record: ICommonApi) => (record.method?.trim() || "GET").toUpperCase();

const ApiManagement = observer(({services}: {services: WorkbenchPageServices}) => {
    useWorkbenchLocale(services);
    const tx = services.i18n.translate;
    const [apiManagementStore] = useState(() => new ApiManagementStore(services));

    const getDisplayName = (record: ICommonApi) => record.name?.trim() || tx("未命名API");
    const getCardTone = (record: ICommonApi, index: number): ApiCardTone => {
        if (vehicleNamePattern.test(getDisplayName(record))) return "vehicle";
        return index % 2 === 1 ? "vehicle" : "users";
    };

    const {doBatchDelete, copyItem, fetchAndEdit, pageData, setModalVisible} = apiManagementStore;
    const {records, current, size, total} = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        apiManagementStore.init();
        return () => apiManagementStore.destroy();
    }, [apiManagementStore]);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            return prev.filter((id) => availableIds.has(id));
        });
    }, [records]);

    const doSearch = (value?: string) => {
        apiManagementStore.searchValue = value?.trim() ?? "";
        apiManagementStore.pageData.current = 1;
        apiManagementStore.getList();
    };

    const toggleSelection = (id?: string) => {
        if (!id) return;
        setSelectedIds((prev) => (
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        ));
    };

    const copyUrl = (event: MouseEvent, value?: string) => {
        event.stopPropagation();
        const text = value?.trim();
        if (!text || !navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => {
            globalMessage.messageApi?.success(tx("复制成功"));
        });
    };

    const editApi = (event: MouseEvent, id?: string) => {
        event.stopPropagation();
        if (!id) return;
        fetchAndEdit(`/api/commonApi/getCommonApi/${id}`);
    };

    const duplicateApi = (event: MouseEvent, id?: string) => {
        event.stopPropagation();
        if (!id) return;
        globalModal.modalApi?.confirm({
            title: tx("复制确认"),
            content: tx("确定复制该公共API吗？"),
            onOk: () => copyItem(`/api/commonApi/copy/${id}`),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 400,
        });
    };

    const deleteApi = (event: MouseEvent, id?: string) => {
        event.stopPropagation();
        if (!id) return;
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除该公共API吗？删除后无法恢复，请谨慎操作。"),
            onOk: () => doBatchDelete([id]),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 400,
        });
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的公共API"));
            return;
        }

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的公共API吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: () => {
                doBatchDelete(selectedIds);
                setSelectedIds([]);
            },
        });
    };

    return (
        <div className={styles.apiPage}>
            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <span className={styles.titleIcon} aria-hidden="true">
                        <Api size={40} fill="#ffffff" />
                    </span>
                    <div className={styles.titleText}>
                        <h1>API管理</h1>
                        <p>集中管理所有公共API，保障服务的可用性与安全性</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder="搜索公共API"
                        prefix={<Search size={20} fill="#9EABC8" />}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button
                        className={styles.createButton}
                        type="primary"
                        icon={<Plus size={19} />}
                        onClick={() => setModalVisible(true)}
                    >
                        新建API
                    </Button>
                    <Button
                        className={styles.batchDeleteButton}
                        icon={<Delete size={19} />}
                        onClick={handleBatchDelete}
                    >
                        删除
                    </Button>
                </div>
            </header>

            <main className={styles.pageBody}>
                <section className={styles.apiListPane}>
                    {records.length === 0 ? (
                        <div className={styles.emptyWrap}>
                            <div className={styles.emptyState}>
                                <div className={styles.emptyIcon} aria-hidden="true">API</div>
                                <div className={styles.emptyDescription}>暂无公共API</div>
                                <Button
                                    className={styles.createButton}
                                    type="primary"
                                    icon={<Plus size={16} />}
                                    onClick={() => setModalVisible(true)}
                                >
                                    新建API
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.apiGrid}>
                            {records.map((record, index) => {
                                const id = record.id;
                                const tone = getCardTone(record, index);
                                const method = getMethod(record);
                                const isSelected = selectedIds.includes(id || "");
                                const toneClass = tone === "vehicle" ? styles.vehicleCard : styles.usersCard;
                                const icon = tone === "vehicle" ? vehicleIcon : usersIcon;

                                return (
                                    <article
                                        key={id || `${record.url}-${index}`}
                                        className={`${styles.apiCard} ${toneClass} ${isSelected ? styles.selectedCard : ""}`}
                                        onClick={() => toggleSelection(id)}
                                    >
                                        <div className={styles.cardTop}>
                                            <img className={styles.cardIcon} src={icon} alt="" />
                                            <div className={styles.cardTitleBlock}>
                                                <h2 title={getDisplayName(record)} data-datavisool-i18n-skip={record.name?.trim() ? "true" : undefined}>{getDisplayName(record)}</h2>
                                                <span className={styles.methodTag} data-method={method}>{method}</span>
                                            </div>
                                            <span className={styles.publishStatus}>
                                                <i />
                                                已发布
                                            </span>
                                        </div>

                                        <div className={styles.cardDivider} />

                                        <div className={styles.urlRow}>
                                            <LinkOne size={20} className={styles.urlIcon} />
                                            <span title={record.url || ""}>{record.url || "未配置URL"}</span>
                                            <button
                                                type="button"
                                                className={styles.copyUrlButton}
                                                aria-label="复制URL"
                                                onClick={(event) => copyUrl(event, record.url)}
                                            >
                                                <Copy size={21} />
                                            </button>
                                        </div>

                                        <div className={styles.cardDivider} />

                                        <div className={styles.cardActions}>
                                            <button type="button" onClick={(event) => editApi(event, id)}>
                                                <Edit size={19} />
                                                编辑
                                            </button>
                                            <button type="button" onClick={(event) => duplicateApi(event, id)}>
                                                <Copy size={19} />
                                                复制
                                            </button>
                                            <button type="button" onClick={(event) => deleteApi(event, id)}>
                                                <Delete size={19} />
                                                删除
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    <div className={styles.paginationContainer}>
                        <Pagination
                            current={current}
                            pageSize={size}
                            total={total}
                            onChange={(page) => apiManagementStore.changeCurrentPage(page)}
                            showSizeChanger={false}
                            showTotal={(totalCount, range) => `第 ${range[0]}-${range[1]} 条，共 ${totalCount} 条`}
                            controlClassName={styles.pagination}
                        />
                    </div>
                </section>

                <section className={styles.wavePane} aria-hidden="true">
                    <img className={styles.bottomWave} src={bottomWave} alt="" />
                </section>
            </main>

            <ApiEditPanel store={apiManagementStore} translate={tx}/>
        </div>
    );
});

export default ApiManagement;
