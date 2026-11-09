/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from "react";
import type {ChangeEvent, DragEvent, KeyboardEvent, MouseEvent} from "react";
import {observer} from "mobx-react";
import {Delete, Edit, FontSize, Search, Upload} from "@icon-park/react";
import {Button, CheckBox, Dialog, Input, Pagination} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import {globalMessage} from "@datavisool/ui";
import fontManagementStore, {IFont} from "@/pages/home/font-management/FontManagementStore.ts";
import styles from "@/pages/home/font-management/FontManagement.module.less";
import {tx} from "@/i18n/miniI18n.ts";

const fontExtensions = [".ttf", ".otf", ".woff", ".woff2", ".eot"];
const maxUploadCount = 10;

interface FontUploadItem {
    uid: string;
    name: string;
    file: File;
}

const getFontName = (record: IFont) => record.name?.trim() || "未命名字体";

const validateFontFile = (file: File) => {
    const fileExtension = file.name.toLowerCase().split(".").pop();

    if (!fontExtensions.includes(`.${fileExtension}`)) {
        globalMessage.messageApi?.error(tx("请上传字体文件"));
        return false;
    }

    return true;
};

const FontManagement = observer(() => {
    const {pageData, modalVisible} = fontManagementStore;
    const {records, current, size, total} = pageData;

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [fileList, setFileList] = useState<FontUploadItem[]>([]);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploading, setUploading] = useState<boolean>(false);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fontManagementStore.init();
        return () => fontManagementStore.destroy();
    }, []);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            return prev.filter((id) => availableIds.has(id));
        });
    }, [records]);

    const doSearch = (value?: string) => {
        fontManagementStore.searchValue = value?.trim() ?? "";
        fontManagementStore.pageData.current = 1;
        fontManagementStore.getList();
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
        fontManagementStore.setModalVisible(false);
        setFileList([]);
        setUploadProgress(0);
    };

    const handleUpload = () => {
        if (fileList.length === 0) return;

        setUploading(true);
        setUploadProgress(0);
        const files = fileList.map((file) => file.file);

        fontManagementStore.uploadFont(files, fontManagementStore.currentItem.id, (percent) => {
            setUploadProgress(percent);
        }).then((res) => {
            if (!res) return;
            globalMessage.messageApi?.success(tx("操作成功"));
            setFileList([]);
            fontManagementStore.setModalVisible(false);
            fontManagementStore.getList();
        }).finally(() => {
            setUploading(false);
            setUploadProgress(0);
        });
    };

    const editFont = (event: MouseEvent, record: IFont) => {
        event.stopPropagation();
        fontManagementStore.setCurrentItem(record);
        globalModal.modalApi?.confirm({
            title: tx("修改字体名称"),
            content: (
                <div className={styles.editModalContent}>
                    <Input
                        placeholder={tx("请输入字体名称")}
                        defaultValue={record.name}
                        onChange={(value) => {
                            fontManagementStore.setCurrentItem({
                                id: record.id,
                                name: value,
                            });
                        }}
                    />
                </div>
            ),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: () => fontManagementStore.updateItem(),
            width: 400,
        });
    };

    const deleteFont = (event: MouseEvent, id?: string) => {
        event.stopPropagation();
        if (!id) return;

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除该字体吗？删除后无法恢复，请谨慎操作！"),
            onOk: () => fontManagementStore.doBatchDelete([id]),
            okText: tx("确定"),
            cancelText: tx("取消"),
            width: 400,
        });
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的字体"));
            return;
        }

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定删除选中的字体吗？删除后无法恢复，请谨慎操作！"),
            onOk: () => {
                fontManagementStore.doBatchDelete(selectedIds);
                setSelectedIds([]);
            },
            okText: tx("确定"),
            cancelText: tx("取消"),
        });
    };

    const appendFontFiles = (nextFileList: File[]) => {
        if (uploading || nextFileList.length === 0) return;

        setFileList((prev) => {
            const availableCount = maxUploadCount - prev.length;

            if (availableCount <= 0) {
                globalMessage.messageApi?.warning(tx(`最多上传 ${maxUploadCount} 个字体文件`));
                return prev;
            }

            const validFiles = nextFileList.filter(validateFontFile);
            if (validFiles.length === 0) return prev;

            const acceptedFiles = validFiles.slice(0, availableCount);

            if (validFiles.length > acceptedFiles.length) {
                globalMessage.messageApi?.warning(tx(`最多上传 ${maxUploadCount} 个字体文件`));
            }

            return [
                ...prev,
                ...acceptedFiles.map((file) => ({
                    uid: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
                    name: file.name,
                    file,
                })),
            ];
        });
    };

    const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        appendFontFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        appendFontFiles(Array.from(event.dataTransfer.files));
    };

    const handleUploadTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        uploadInputRef.current?.click();
    };

    return (
        <div className={styles.fontPage}>
            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <span className={styles.titleIcon} aria-hidden="true">
                        <FontSize size={24} fill="#6e8dff" />
                    </span>
                    <div className={styles.titleText}>
                        <h1>字体管理</h1>
                        <p>集中管理和维护所有字体资源，保证项目中字体的统一性和可用性</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder="搜索字体名称 / 预览内容"
                        prefix={<Search size={18} fill="#9EABC8" />}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button
                        className={styles.uploadButton}
                        type="primary"
                        icon={<Upload size={18} />}
                        onClick={() => fontManagementStore.setModalVisible(true)}
                    >
                        上传字体
                    </Button>
                    <Button
                        className={styles.batchDeleteButton}
                        icon={<Delete size={18} />}
                        onClick={handleBatchDelete}
                    >
                        删除
                    </Button>
                </div>
            </header>

            <main className={styles.pageBody}>
                <section className={styles.fontListPane}>
                    {records.length === 0 ? (
                        <div className={styles.emptyWrap}>
                            <div className={styles.emptyState}>
                                <div className={styles.emptyIcon} aria-hidden="true">Aa</div>
                                <div className={styles.emptyDescription}>暂无字体</div>
                                <Button
                                    className={styles.uploadButton}
                                    type="primary"
                                    icon={<Upload size={16} />}
                                    onClick={() => fontManagementStore.setModalVisible(true)}
                                >
                                    上传字体
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.fontGrid}>
                            {records.map((record, index) => {
                                const id = record.id;
                                const fontName = getFontName(record);
                                const isSelected = selectedIds.includes(id || "");
                                const toneClass = index % 2 === 0 ? styles.purpleCard : styles.blueCard;

                                return (
                                    <article
                                        key={id || `${fontName}-${index}`}
                                        className={`${styles.fontCard} ${toneClass} ${isSelected ? styles.selectedCard : ""}`}
                                        onClick={() => toggleSelection(id)}
                                    >
                                        <div className={styles.cardCheckbox} onClick={(event) => event.stopPropagation()}>
                                            <CheckBox
                                                value={isSelected}
                                                onChange={() => toggleSelection(id)}
                                            />
                                        </div>

                                        <div className={styles.cardTop}>
                                            <div className={styles.fontBadge}>Aa</div>
                                            <div className={styles.cardTitleBlock}>
                                                <h2 title={fontName}>{fontName}</h2>
                                                <span>已启用</span>
                                            </div>
                                        </div>

                                        <div className={styles.previewBox}>
                                            <span className={styles.previewLabel}>字体预览</span>
                                            <div className={styles.previewLine} style={{fontFamily: `"${fontName}"`}}>
                                                字体预览 <em> AaBbCc123</em>
                                            </div>
                                            <strong aria-hidden="true">Aa</strong>
                                        </div>

                                        <div className={styles.cardActions}>
                                            <button type="button" onClick={(event) => editFont(event, record)}>
                                                <Edit size={17} />
                                                编辑
                                            </button>
                                            <button type="button" onClick={(event) => deleteFont(event, id)}>
                                                <Delete size={17} />
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
                            onChange={(page) => fontManagementStore.changeCurrentPage(page)}
                            showSizeChanger={false}
                            showTotal={(totalCount, range) => `第 ${range[0]}-${range[1]} 条，共 ${totalCount} 条`}
                            controlClassName={styles.pagination}
                        />
                    </div>
                </section>

                <section className={styles.wavePane} aria-hidden="true" />
            </main>

            <Dialog
                open={modalVisible}
                title="上传字体"
                onClose={closeUploadModal}
                className={styles.uploadModal}
                bodyClassName={styles.uploadModalBody}
                mask
                maskClosable={false}
                centered
                showClose
                width={520}
            >
                <div
                    className={styles.uploadDragger}
                    role="button"
                    tabIndex={uploading ? -1 : 0}
                    aria-disabled={uploading}
                    onClick={() => {
                        if (!uploading) uploadInputRef.current?.click();
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                    onKeyDown={handleUploadTriggerKeyDown}
                >
                    <input
                        ref={uploadInputRef}
                        type="file"
                        multiple
                        accept={fontExtensions.join(",")}
                        disabled={uploading}
                        className={styles.uploadFileInput}
                        onClick={(event) => event.stopPropagation()}
                        onChange={handleFileInputChange}
                    />
                    <Upload fill="#717FA6" size={26} />
                    <p className={styles.uploadText}>
                        {fileList.length > 0 ? `已选择 ${fileList.length} 个字体文件` : "点击或拖拽字体文件上传"}
                    </p>
                </div>

                {fileList.length > 0 && (
                    <ul className={styles.uploadFileList}>
                        {fileList.map((file) => (
                            <li key={file.uid}>
                                <span title={file.name} data-datavisool-i18n-skip="true">{file.name}</span>
                                <button
                                    type="button"
                                    disabled={uploading}
                                    onClick={() => setFileList((prev) => prev.filter((item) => item.uid !== file.uid))}
                                >
                                    删除
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {uploading && (
                    <div className={styles.uploadProgress}>
                        <div className={styles.uploadProgressTrack}>
                            <div className={styles.uploadProgressBar} style={{width: `${Math.round(uploadProgress)}%`}} />
                        </div>
                        <span>{Math.round(uploadProgress)}%</span>
                    </div>
                )}

                <div className={styles.uploadModalFooter}>
                    <Button
                        key="ok"
                        type="primary"
                        onClick={handleUpload}
                        className={styles.modalUploadButton}
                        loading={uploading}
                        disabled={fileList.length === 0}
                    >
                        {uploading ? "上传中..." : "上传字体"}
                    </Button>
                    <Button
                        key="cancel"
                        onClick={closeUploadModal}
                        className={styles.modalCancelButton}
                        disabled={uploading}
                    >
                        取消
                    </Button>
                </div>
            </Dialog>
        </div>
    );
});

export default FontManagement;
