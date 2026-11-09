/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {observer} from "mobx-react";
import {useEffect, useMemo, useState} from "react";
import {Button, Empty, Input, Pagination} from "@datavisool/ui";
import {Delete, Edit, Iphone, Mail, Peoples, Plus, Search, Shield} from "@icon-park/react";
import userManagementStore, {IUser} from "./UserManagementStore.ts";
import UserPanel from "./UserPanel.tsx";
import {globalMessage, globalModal} from "@datavisool/ui";
import styles from "./UserManagement.module.less";
import {tx} from "@/i18n/miniI18n.ts";

const getDisplayName = (record: IUser) => record.name?.trim() || record.username?.trim() || tx("未命名用户");

const getInitials = (record: IUser) => {
    const name = getDisplayName(record);
    return name.slice(0, 2).toUpperCase();
};

const formatContact = (value?: string) => value?.trim() || "-";

const UserManagement = observer(() => {
    const {pageData} = userManagementStore;
    const {records, current, size, total} = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");

    useEffect(() => {
        userManagementStore.init();
        return () => userManagementStore.destroy();
    }, []);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            return prev.filter((id) => availableIds.has(id));
        });
    }, [records]);

    const selectedCount = selectedIds.length;
    const isAllSelected = records.length > 0 && records.every((record) => record.id && selectedIds.includes(record.id));
    const contactReadyCount = useMemo(() => records.filter((record) => record.phone || record.email).length, [records]);

    const doSearch = (value?: string) => {
        const nextValue = value?.trim() ?? "";
        setSearchValue(nextValue);
        userManagementStore.searchValue = nextValue;
        userManagementStore.pageData.current = 1;
        userManagementStore.getList();
    };

    const toggleSelection = (id?: string) => {
        if (!id) return;
        setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (isAllSelected) {
            setSelectedIds([]);
            return;
        }
        setSelectedIds(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
    };

    const openCreatePanel = () => {
        userManagementStore.setCurrentItem({});
        userManagementStore.setModalVisible(true);
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的用户"));
            return;
        }
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的用户吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: async () => {
                if (!await userManagementStore.deleteUsers(selectedIds)) return false;
                setSelectedIds([]);
            },
        });
    };

    const handleDelete = (id?: string) => {
        if (!id) return;
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除该用户吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: async () => (await userManagementStore.deleteUsers([id])) || false,
        });
    };

    const doSubmit = (data: IUser) => {
        void userManagementStore.saveUser(data);
    };

    return (
        <div className={styles.userPage}>
            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <span className={styles.titleIcon} aria-hidden="true"><Peoples size={22}/></span>
                    <div className={styles.titleText}>
                        <h1>{tx("用户管理")}</h1>
                        <p>{tx("维护系统账号、联系信息和角色授权，确保访问边界清晰可控。")}</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        value={searchValue}
                        onChange={setSearchValue}
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder={tx("搜索用户名 / 姓名 / 邮箱")}
                        prefix={<Search size={18} fill="#A7B4D6"/>}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button className={styles.createButton} type="primary" icon={<Plus size={18}/>} onClick={openCreatePanel}>
                        {tx("新建用户")}
                    </Button>
                    <Button className={styles.batchDeleteButton} type="default" icon={<Delete size={18}/>} onClick={handleBatchDelete}>
                        {tx("删除")}
                    </Button>
                </div>
            </header>

            <section className={styles.summaryBar}>
                <div className={styles.summaryItem}>
                    <span className={styles.summaryIcon}><Peoples size={22}/></span>
                    <span>
                        <strong>{total}</strong>
                        <small>{tx("账户总数")}</small>
                    </span>
                </div>
                <div className={styles.summaryItem}>
                    <span className={styles.summaryIcon}><Shield size={22}/></span>
                    <span>
                        <strong>{records.length}</strong>
                        <small>{tx("当前页用户")}</small>
                    </span>
                </div>
                <div className={styles.summaryItem}>
                    <span className={styles.summaryIcon}><Mail size={22}/></span>
                    <span>
                        <strong>{contactReadyCount}</strong>
                        <small>{tx("已补充联系方式")}</small>
                    </span>
                </div>
                <div className={`${styles.summaryItem} ${selectedCount > 0 ? styles.summaryActive : ""}`}>
                    <span className={styles.summaryIcon}><Delete size={22}/></span>
                    <span>
                        <strong>{selectedCount}</strong>
                        <small>{tx("已选择")}</small>
                    </span>
                </div>
            </section>

            <main className={styles.pageBody}>
                <div className={styles.tableShell}>
                    <div className={`${styles.tableRow} ${styles.tableHead}`}>
                        <button
                            className={`${styles.checkbox} ${isAllSelected ? styles.checkboxChecked : ""}`}
                            type="button"
                            aria-label={tx("全选")}
                            onClick={toggleAll}
                        />
                        <div>{tx("用户")}</div>
                        <div>{tx("用户名")}</div>
                        <div>{tx("电话")}</div>
                        <div>{tx("邮箱")}</div>
                        <div>{tx("操作")}</div>
                    </div>

                    {records.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Empty title={null} description={tx("暂无用户")}/>
                            <Button className={styles.createButton} type="primary" icon={<Plus size={16}/>} onClick={openCreatePanel}>
                                {tx("新建用户")}
                            </Button>
                        </div>
                    ) : records.map((record) => {
                        const checked = Boolean(record.id && selectedIds.includes(record.id));
                        return (
                            <div className={styles.tableRow} key={record.id}>
                                <button
                                    className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}
                                    type="button"
                                    aria-label={tx("选择用户")}
                                    onClick={() => toggleSelection(record.id)}
                                />
                                <div className={styles.userCell}>
                                    <span className={styles.avatar}>{getInitials(record)}</span>
                                    <span className={styles.userMeta}>
                                        <strong title={getDisplayName(record)} data-datavisool-i18n-skip={(record.name?.trim() || record.username?.trim()) ? "true" : undefined}>{getDisplayName(record)}</strong>
                                        <small>ID {record.id || "-"}</small>
                                    </span>
                                </div>
                                <div className={styles.textCell} title={record.username} data-datavisool-i18n-skip="true">{formatContact(record.username)}</div>
                                <div className={styles.contactCell} title={record.phone}>
                                    <Iphone size={16}/>
                                    <span data-datavisool-i18n-skip="true">{formatContact(record.phone)}</span>
                                </div>
                                <div className={styles.contactCell} title={record.email}>
                                    <Mail size={16}/>
                                    <span>{formatContact(record.email)}</span>
                                </div>
                                <div className={styles.actionGroup}>
                                    <button
                                        className={styles.actionButton}
                                        type="button"
                                        onClick={() => userManagementStore.doEditUserInfo(record.id!)}
                                    >
                                        <Edit size={16}/>
                                        {tx("编辑")}
                                    </button>
                                    <button
                                        className={`${styles.actionButton} ${styles.dangerAction}`}
                                        type="button"
                                        onClick={() => handleDelete(record.id)}
                                    >
                                        <Delete size={16}/>
                                        {tx("删除")}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {total > 0 ? (
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
                                userManagementStore.changeCurrentPage(page);
                            }}
                        />
                    </div>
                ) : null}
            </main>

            <UserPanel
                visible={userManagementStore.modalVisible}
                title={userManagementStore.currentItem.id ? tx("编辑用户") : tx("新增用户")}
                data={userManagementStore.currentItem as IUser}
                saving={userManagementStore.saving}
                onClose={() => { if (!userManagementStore.saving) userManagementStore.setModalVisible(false); }}
                onSubmitted={doSubmit}
            />
        </div>
    );
});

export default UserManagement;
