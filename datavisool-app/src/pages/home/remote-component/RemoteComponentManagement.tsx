/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from "react";
import type {MouseEvent} from "react";
import {Button, Dialog, Empty, Input, Pagination, Progress, Upload as DatavisoolUpload} from "@datavisool/ui";
import type {UploadFile} from "@datavisool/ui";
import {observer} from "mobx-react";
import {DataServer, Delete, Edit, Search, Switch, Upload as UploadIcon} from "@icon-park/react";
import {globalModal} from "@datavisool/ui";
import {globalMessage} from "@datavisool/ui";
import baseApi from "@/api/engineering/BaseApi.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import remoteComponentStore, {IRemoteComponent} from "@/pages/home/remote-component/RemoteComponentStore.ts";
import styles from "@/pages/home/remote-component/RemoteComponentManagement.module.less";
import serverIcon from "@/pages/home/remote-component/assets/remote-component-server.webp";
import sceneBg from "@/pages/home/remote-component/assets/remote-component-bg.webp";
import {tx} from "@/i18n/miniI18n.ts";

const {Dragger} = DatavisoolUpload;

const getComponentName = (record: IRemoteComponent) => record.componentName?.trim() || "未命名组件";

const validateComponentFile = (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".js") && !lower.endsWith(".mjs") && !lower.endsWith(".zip")) {
        globalMessage.messageApi?.error(tx("请上传 js、mjs 或 zip 文件"));
        return false;
    }

    if (file.size === 0) {
        globalMessage.messageApi?.error(tx("组件文件不能为空"));
        return false;
    }

    return true;
};

const RemoteComponentManagement = observer(() => {
    const {pageData, modalVisible, currentItem} = remoteComponentStore;
    const {records, current, size, total} = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploading, setUploading] = useState<boolean>(false);
    const uploadInFlight = useRef(false);

    useEffect(() => {
        remoteComponentStore.init();
        return () => remoteComponentStore.destroy();
    }, []);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            return prev.filter((id) => availableIds.has(id));
        });
    }, [records]);

    const doSearch = (value?: string) => {
        remoteComponentStore.searchValue = value?.trim() ?? "";
        remoteComponentStore.pageData.current = 1;
        remoteComponentStore.getList();
    };

    const toggleSelection = (id?: string) => {
        if (!id) return;
        setSelectedIds((prev) => (
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        ));
    };

    const closeUploadModal = () => {
        if (uploading) return;
        remoteComponentStore.setModalVisible(false);
        setFileList([]);
        setUploadProgress(0);
    };

    const openUploadModal = () => {
        remoteComponentStore.setCurrentItem({});
        remoteComponentStore.setModalVisible(true);
    };

    const openReplaceModal = (event: MouseEvent, record: IRemoteComponent) => {
        event.stopPropagation();
        remoteComponentStore.setCurrentItem({id: record.id});
        remoteComponentStore.setModalVisible(true);
    };

    const editComponent = (event: MouseEvent, record: IRemoteComponent) => {
        event.stopPropagation();
        let name = record.componentName || "";
        globalModal.modalApi?.confirm({
            title: tx("修改组件名称"),
            content: (
                <div className={styles.editModalContent}>
                    <Input
                        placeholder={tx("请输入组件名称")}
                        defaultValue={record.componentName}
                        maxLength={255}
                        onChange={(value) => {name = value;}}
                    />
                </div>
            ),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: async () => {
                if (!record.id || !name.trim()) {
                    globalMessage.messageApi?.error(tx("请输入组件名称"));
                    return false;
                }
                const result = await AuthFetchUtil.post<boolean>("/api/remote/component/update", {id: record.id, componentName: name.trim()});
                if (result !== true) {
                    if (result === false) globalMessage.messageApi?.error(tx("修改失败"));
                    return false;
                }
                remoteComponentStore.getList();
                globalMessage.messageApi?.success(tx("操作成功"));
            },
            width: 400,
        });
    };

    const deleteItems = async (ids: string[]) => {
        const result = await AuthFetchUtil.post<boolean>("/api/remote/component/batchDel", ids);
        if (result !== true) {
            if (result === false) globalMessage.messageApi?.error(tx("删除失败"));
            return false;
        }
        setSelectedIds([]);
        remoteComponentStore.getList();
        globalMessage.messageApi?.success(tx("删除成功"));
    };

    const deleteComponent = (event: MouseEvent, id?: string) => {
        event.stopPropagation();
        if (!id) return;

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的服务器组件吗？删除前请确保该组件没有被其他项目使用。否则将导致使用的项目无法渲染对应的组件，删除后无法恢复，请谨慎操作！"),
            onOk: () => deleteItems([id]),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 460,
        });
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的服务器组件"));
            return;
        }

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的服务器组件吗？删除前请确保该组件没有被其他项目使用。否则将导致使用的项目无法渲染对应的组件，删除后无法恢复，请谨慎操作！"),
            onOk: () => deleteItems(selectedIds),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 460,
        });
    };

    const handleUpload = () => {
        if (fileList.length === 0 || uploadInFlight.current) return;

        uploadInFlight.current = true;
        setUploading(true);
        setUploadProgress(24);
        const file = fileList[0].originFileObj as File;

        baseApi.uploadRemoteComponent(file, currentItem.id).then((res) => {
            if (res !== true) {
                if (res === false) globalMessage.messageApi?.error(tx("上传失败"));
                return;
            }
            setUploadProgress(100);
            globalMessage.messageApi?.success(tx("操作成功"));
            setFileList([]);
            remoteComponentStore.setModalVisible(false);
            remoteComponentStore.getList();
        }).finally(() => {
            uploadInFlight.current = false;
            setUploading(false);
            setUploadProgress(0);
        });
    };

    const uploadModeText = currentItem.id ? "替换" : "上传";

    return (
        <div className={styles.remoteComponentPage}>
            <img className={styles.sceneBackground} src={sceneBg} alt="" />

            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <span className={styles.titleIcon} aria-hidden="true">
                        <DataServer size={56} fill="#6e8dff" />
                    </span>
                    <div className={styles.titleText}>
                        <h1>服务器组件</h1>
                        <p>集中管理和维护所有服务器组件，保障系统稳定与高效运行</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder="搜索服务器组件"
                        prefix={<Search size={20} fill="#9EABC8" />}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button
                        className={styles.uploadButton}
                        type="primary"
                        icon={<UploadIcon size={19} />}
                        onClick={openUploadModal}
                    >
                        上传
                    </Button>
                    <Button
                        className={styles.batchDeleteButton}
                        type="default"
                        icon={<Delete size={19} />}
                        onClick={handleBatchDelete}
                    >
                        删除
                    </Button>
                </div>
            </header>

            <main className={styles.pageBody}>
                <section className={styles.componentListPane}>
                    {records.length === 0 ? (
                        <div className={styles.emptyWrap}>
                            <Empty title={null} description="暂无服务器组件">
                                <Button
                                    className={styles.uploadButton}
                                    type="primary"
                                    icon={<UploadIcon size={16} />}
                                    onClick={openUploadModal}
                                >
                                    上传
                                </Button>
                            </Empty>
                        </div>
                    ) : (
                        <div className={styles.componentGrid}>
                            {records.map((record, index) => {
                                const id = record.id;
                                const componentName = getComponentName(record);
                                const isSelected = selectedIds.includes(id || "");
                                const toneClass = index % 2 === 0 ? styles.purpleCard : styles.blueCard;

                                return (
                                    <article
                                        key={id || `${componentName}-${index}`}
                                        className={`${styles.componentCard} ${toneClass} ${isSelected ? styles.selectedCard : ""}`}
                                        onClick={() => toggleSelection(id)}
                                    >
                                        <button
                                            type="button"
                                            className={`${styles.cardCheckbox} ${isSelected ? styles.cardCheckboxChecked : ""}`}
                                            aria-label={isSelected ? "取消选择组件" : "选择组件"}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                toggleSelection(id);
                                            }}
                                        />

                                        <div className={styles.cardTop}>
                                            <img className={styles.cardIcon} src={serverIcon} alt="" />
                                            <div className={styles.cardTitleBlock}>
                                                <h2 title={componentName}>{componentName}</h2>
                                                <p title={record.url || ""}>{record.url || "未配置组件地址"}</p>
                                                <span>远程组件</span>
                                            </div>
                                        </div>

                                        <div className={styles.cardDivider} />

                                        <div className={styles.cardActions}>
                                            <button type="button" onClick={(event) => editComponent(event, record)}>
                                                <Edit size={20} />
                                                编辑
                                            </button>
                                            <i />
                                            <button type="button" onClick={(event) => openReplaceModal(event, record)}>
                                                <Switch size={20} />
                                                替换
                                            </button>
                                            <i />
                                            <button type="button" className={styles.deleteAction} onClick={(event) => deleteComponent(event, id)}>
                                                <Delete size={20} />
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
                            onChange={(page) => remoteComponentStore.changeCurrentPage(page)}
                            showSizeChanger={false}
                            showTotal={(totalCount, range) => `第 ${range[0]}-${range[1]} 条，共 ${totalCount} 条`}
                            controlClassName={styles.pagination}
                        />
                    </div>
                </section>
            </main>

            <Dialog
                open={modalVisible}
                title={`${uploadModeText}服务器组件`}
                onClose={closeUploadModal}
                width={520}
                mask
                centered
                showClose
                className={styles.uploadModal}
            >
                <Dragger
                    multiple={false}
                    maxCount={1}
                    fileList={fileList}
                    accept=".js,.mjs,.zip"
                    beforeUpload={(file: File) => {
                        if (!validateComponentFile(file)) {
                            return DatavisoolUpload.LIST_IGNORE;
                        }

                        setFileList([{
                            uid: `${file.name}-${Date.now()}`,
                            name: file.name,
                            status: "done",
                            originFileObj: file,
                        }]);
                        return false;
                    }}
                    onRemove={() => {
                        setFileList([]);
                    }}
                    className={styles.uploadDragger}
                    disabled={uploading}
                >
                    <UploadIcon fill="#717171" size={22} />
                    <p className={styles.uploadText}>点击或拖拽 js / mjs / zip 文件上传</p>
                </Dragger>
                {uploading && (
                    <div className={styles.progressWrap}>
                        <Progress percent={Math.round(uploadProgress)} status="active" />
                    </div>
                )}
                <div className={styles.uploadModalFooter}>
                    <Button
                        type="primary"
                        onClick={handleUpload}
                        className={styles.modalUploadButton}
                        loading={uploading}
                        disabled={fileList.length === 0}
                    >
                        {uploading ? `${uploadModeText}中...` : uploadModeText}
                    </Button>
                    <Button
                        onClick={closeUploadModal}
                        className={styles.modalCancelButton}
                        type="default"
                        disabled={uploading}
                    >
                        取消
                    </Button>
                </div>
            </Dialog>
        </div>
    );
});

export default RemoteComponentManagement;
