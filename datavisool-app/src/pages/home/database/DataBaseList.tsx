/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useState} from "react";
import {observer} from "mobx-react";
import {Copy, DataOne, Delete, Edit, LinkOne, Plus, Search} from "@icon-park/react";
import {globalMessage} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import dataSourceStore, {IDataSource} from "@/pages/home/database/DataBaseStore.ts";
import DataBasePanel from "@/pages/home/database/DataBasePanel.tsx";
import styles from "@/pages/home/database/DataBaseList.module.less";
import {tx} from "@/i18n/miniI18n.ts";
import {Button, CheckBox, Empty, Input, Pagination} from "@datavisool/ui";
import titleEmblem from "@/pages/home/database/assets/database-title-emblem.webp";
import oracleLogo from "@/pages/home/database/assets/database-logo-oracle.webp";
import postgresqlLogo from "@/pages/home/database/assets/database-logo-postgresql.webp";
import mysqlLogo from "@/pages/home/database/assets/database-logo-mysql.webp";
import sqlserverLogo from "@/pages/home/database/assets/database-logo-sqlserver.webp";

type DataSourceTone = "oracle" | "postgresql" | "mysql" | "sqlserver" | "default";

interface DataSourceMeta {
    label: string;
    description: string;
    icon: string;
    tone: DataSourceTone;
}

const normalizeType = (type?: string) => (type || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const getDataSourceMeta = (item: IDataSource): DataSourceMeta => {
    const normalizedType = normalizeType(item.type);

    if (normalizedType.includes("oracle")) {
        return {
            label: "ORACLE",
            description: item.des || "Oracle Database",
            icon: oracleLogo,
            tone: "oracle",
        };
    }

    if (normalizedType.includes("postgres")) {
        return {
            label: "POSTGRESQL",
            description: item.des || "PostgreSQL Database",
            icon: postgresqlLogo,
            tone: "postgresql",
        };
    }

    if (normalizedType.includes("mysql")) {
        return {
            label: "MYSQL",
            description: item.des || "MySQL Database",
            icon: mysqlLogo,
            tone: "mysql",
        };
    }

    if (normalizedType.includes("sqlserver") || normalizedType.includes("mssql")) {
        return {
            label: "SQLSERVER",
            description: item.des || "SQL Server Database",
            icon: sqlserverLogo,
            tone: "sqlserver",
        };
    }

    return {
        label: item.type?.toUpperCase() || "DATABASE",
        description: item.des || "Database",
        icon: titleEmblem,
        tone: "default",
    };
};

const DataBaseList = observer(() => {
    const {
        doBatchDelete,
        setModalVisible,
        doCreateOrUpdateDataSource,
        modalVisible,
        currentItem,
        copyItem,
        openDataSourceEditor,
        testConnect,
        pageData,
    } = dataSourceStore;
    const {records, current, size, total} = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        dataSourceStore.init();
        return () => dataSourceStore.destroy();
    }, []);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            return prev.filter((id) => availableIds.has(id));
        });
    }, [records]);

    const doSearch = (value?: string) => {
        dataSourceStore.searchValue = value?.trim() ?? "";
        dataSourceStore.pageData.current = 1;
        dataSourceStore.getList();
    };

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => (
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        ));
    };

    const updateSelection = (id: string, checked: boolean) => {
        setSelectedIds((prev) => (
            checked
                ? (prev.includes(id) ? prev : [...prev, id])
                : prev.filter((item) => item !== id)
        ));
    };

    const doDeleteDataSource = (id: string) => {
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除该数据库链接吗？"),
            onOk: () => doBatchDelete([id]),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 400,
        });
    };

    const doCopyDataSource = (id: string) => {
        globalModal.modalApi?.confirm({
            title: tx("复制确认"),
            content: tx("确定复制该数据库链接吗？"),
            onOk: () => copyItem(`/api/commonDatabase/copy/${id}`),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 400,
        });
    };

    const doBatchDeleteDataSource = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的数据源"));
            return;
        }

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的数据库链接吗？删除后无法恢复，请谨慎操作！"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: () => {
                doBatchDelete(selectedIds);
                setSelectedIds([]);
            },
        });
    };

    const renderEditPanel = () => (
        <DataBasePanel
            visible={modalVisible}
            title={currentItem.id ? "编辑数据库链接" : "创建数据库连接"}
            data={currentItem}
            onClose={() => setModalVisible(false)}
            onSubmitted={doCreateOrUpdateDataSource}
        />
    );

    return (
        <div className={styles.databasePage}>
            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <span className={styles.titleIcon} aria-hidden="true">
                        <DataOne size={56} fill="#6e8dff" />
                    </span>
                    <div className={styles.titleText}>
                        <h1>数据源管理</h1>
                        <p>集中管理和维护所有数据源连接，保障数据访问的安全与高效</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder="搜索数据源名称/类型/描述"
                        prefix={<Search size={18} fill="#B6C2E2" />}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button
                        className={styles.createButton}
                        type="primary"
                        icon={<Plus size={18} />}
                        onClick={() => setModalVisible(true)}
                    >
                        新建数据源
                    </Button>
                    <Button
                        className={styles.batchDeleteButton}
                        icon={<Delete size={18} />}
                        onClick={doBatchDeleteDataSource}
                    >
                        删除
                    </Button>
                </div>
            </header>

            <main className={styles.pageBody}>
                {records.length === 0 ? (
                    <div className={styles.emptyWrap}>
                        <Empty
                            size="lg"
                            title="暂无数据源"
                            action={(
                                <Button
                                    className={styles.createButton}
                                    type="primary"
                                    icon={<Plus size={16} />}
                                    onClick={() => setModalVisible(true)}
                                >
                                    新建数据源
                                </Button>
                            )}
                        />
                    </div>
                ) : (
                    <div className={styles.cardGrid}>
                        {records.map((item) => {
                            const id = item.id!;
                            const isSelected = selectedIds.includes(id);
                            const meta = getDataSourceMeta(item);

                            return (
                                <article
                                    key={id}
                                    className={`${styles.dataSourceCard} ${styles[meta.tone]} ${isSelected ? styles.selected : ""}`}
                                    onClick={() => toggleSelection(id)}
                                >
                                    <div className={styles.cardHeader}>
                                        <div className={styles.cardCheckbox} onClick={(event) => event.stopPropagation()}>
                                            <CheckBox
                                                value={isSelected}
                                                onChange={(checked) => updateSelection(id, checked)}
                                            />
                                        </div>
                                        <div className={styles.tags}>
                                            <span className={`${styles.typeTag} ${styles[meta.tone]}`}>{meta.label}</span>
                                            {item.allowSqlScript && (
                                                <span className={styles.scriptTag}>SQL脚本</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.cardMain}>
                                        <img className={styles.vendorLogo} src={meta.icon} alt="" />
                                        <div className={styles.cardText}>
                                            <h2 title={item.name} data-datavisool-i18n-skip={item.name?.trim() ? "true" : undefined}>{item.name || tx("未命名数据源")}</h2>
                                            <p title={meta.description}>{meta.description}</p>
                                        </div>
                                    </div>

                                    <div className={styles.cardDivider} />

                                    <div className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
                                        <button type="button" onClick={() => openDataSourceEditor(id)}>
                                            <Edit size={18} />
                                            编辑
                                        </button>
                                        <button type="button" onClick={() => doCopyDataSource(id)}>
                                            <Copy size={18} />
                                            复制
                                        </button>
                                        <button type="button" onClick={() => testConnect(id)}>
                                            <LinkOne size={18} />
                                            测试
                                        </button>
                                        <button type="button" onClick={() => doDeleteDataSource(id)}>
                                            <Delete size={18} />
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
                        onChange={(page) => dataSourceStore.changeCurrentPage(page)}
                        showSizeChanger={false}
                        showTotal={(totalCount, range) => `第 ${range[0]}-${range[1]} 条，共 ${totalCount} 条`}
                        controlClassName={styles.pagination}
                    />
                </div>
            </main>

            {renderEditPanel()}
        </div>
    );
});

export default DataBaseList;
