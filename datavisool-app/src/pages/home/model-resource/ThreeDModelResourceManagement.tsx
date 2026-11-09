/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useRef, useState} from "react";
import type {MouseEvent} from "react";
import {observer} from "mobx-react";
import {Button, Dialog, Dropdown, Empty, Input, Pagination, Progress, Upload as DatavisoolUpload} from "@datavisool/ui";
import type {DropdownMenuItem, UploadFile} from "@datavisool/ui";
import {Copy, Cube, Delete, Edit, More, Refresh, Search, Upload} from "@icon-park/react";
import threeDModelResourceStore, {IThreeDModelResource} from "@/pages/home/model-resource/ThreeDModelResourceStore";
import AuthFetchUtil from "@/util/AuthFetchUtil";
import {globalMessage} from "@datavisool/ui";
import {globalModal} from "@datavisool/ui";
import axios from "axios";
import AuthTools from "@/util/AuthTools.ts";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";
import styles from "@/pages/home/model-resource/ThreeDModelResourceManagement.module.less";
import thumbGreen from "@/pages/home/model-resource/assets/model-thumb-green.webp";
import thumbRed from "@/pages/home/model-resource/assets/model-thumb-red.webp";
import {tx} from "@/i18n/miniI18n.ts";

const {Dragger} = DatavisoolUpload;

const getDisplayName = (item: IThreeDModelResource) => item.name?.trim() || tx("未命名模型");

const formatFileSize = (size?: number) => {
    if (!size) return "未知大小";
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

const getModelType = (item: IThreeDModelResource) => {
    if (item.isCompressed === 1) return "ZIP";

    const mimeType = item.type?.trim().toLowerCase();
    if (mimeType?.includes("zip")) return "ZIP";
    if (mimeType?.includes("gltf") || mimeType?.includes("glb")) return "GLTF/GLB";

    const source = (item.name || item.url || "").split("?")[0].toLowerCase();
    if (source.endsWith(".zip")) return "ZIP";
    if (source.endsWith(".fbx")) return "FBX";
    if (source.endsWith(".obj")) return "OBJ";
    if (source.endsWith(".glb") || source.endsWith(".gltf")) return "GLTF/GLB";
    return "GLTF/GLB";
};

const isZipModel = (item: IThreeDModelResource) => getModelType(item) === "ZIP";

const ThreeDModelResourceManagement = observer(() => {
    const isTauri = AssetUrlUtil.isTauri();
    const {pageData, modalVisible, currentItem} = threeDModelResourceStore;
    const {records, current, size, total} = pageData;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploading, setUploading] = useState(false);
    const uploadInFlight = useRef(false);

    useEffect(() => {
        threeDModelResourceStore.init();
        return () => threeDModelResourceStore.destroy();
    }, []);

    useEffect(() => {
        setSelectedIds((prev) => {
            const availableIds = new Set(records.map((item) => item.id).filter((id): id is string => Boolean(id)));
            return prev.filter((id) => availableIds.has(id));
        });
    }, [records]);

    const resolveModelUrl = (url?: string) => {
        if (!url) return url;
        return AssetUrlUtil.toLoadableUrl(url);
    };

    const doSearch = (value?: string) => {
        threeDModelResourceStore.searchValue = value?.trim() ?? "";
        threeDModelResourceStore.pageData.current = 1;
        threeDModelResourceStore.getList();
    };

    const toggleSelection = (id?: string) => {
        if (!id) return;
        setSelectedIds((prev) => (
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        ));
    };

    const handleRename = (item: IThreeDModelResource) => {
        let newName = getDisplayName(item);
        globalModal.modalApi?.confirm({
            title: tx("重命名模型"),
            content: (
                <Input
                    defaultValue={newName}
                    onChange={(value) => newName = value}
                    placeholder={tx("请输入新的模型名称")}
                    maxLength={255}
                />
            ),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: async () => {
                if (!newName.trim() || !item.id) {
                    globalMessage.messageApi?.error(tx("请输入新的模型名称"));
                    return false;
                }
                const result = await AuthFetchUtil.post<boolean>("/api/model/update", {id: item.id, name: newName.trim()});
                if (result !== true) {
                    if (result === false) globalMessage.messageApi?.error(tx("重命名失败"));
                    return false;
                }
                threeDModelResourceStore.getList();
                globalMessage.messageApi?.success(tx("重命名成功"));
            }
        });
    };

    const handleCopyUrl = (event: MouseEvent, url?: string) => {
        event.stopPropagation();
        if (!url || !navigator.clipboard) return;
        navigator.clipboard.writeText(resolveModelUrl(url) || url).then(() => {
            globalMessage.messageApi?.success(tx("链接已复制"));
        });
    };

    const handleSingleDelete = (event: MouseEvent, id?: string) => {
        event.stopPropagation();
        if (!id) return;
        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定要删除这个模型吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: () => threeDModelResourceStore.doBatchDelete([id])
        });
    };

    const handleBatchDelete = () => {
        if (selectedIds.length === 0) {
            globalMessage.messageApi?.warning(tx("请选择要删除的模型"));
            return;
        }

        globalModal.modalApi?.confirm({
            title: tx("删除确认"),
            content: tx("确定要删除选中的模型吗？删除后无法恢复，请谨慎操作。"),
            okText: tx("确定"),
            cancelText: tx("取消"),
            onOk: () => {
                threeDModelResourceStore.doBatchDelete(selectedIds);
                setSelectedIds([]);
            },
        });
    };

    const openUploadModal = () => {
        threeDModelResourceStore.setCurrentItem({});
        threeDModelResourceStore.setModalVisible(true);
    };

    const openReplaceModal = (event: MouseEvent, item: IThreeDModelResource) => {
        event.stopPropagation();
        threeDModelResourceStore.setCurrentItem(item);
        threeDModelResourceStore.setModalVisible(true);
    };

    const uploadAction = (files: File[], id?: string, onProgress?: (percent: number) => void): Promise<boolean> => {
        return new Promise((resolve) => {
            if (isTauri) {
                const maxBytes = 500 * 1024 * 1024;
                const tooLarge = files.find((file) => file.size > maxBytes);
                if (tooLarge) {
                    globalMessage.messageApi?.error(tx(`文件过大：${tooLarge.name}，请控制在 500MB 以内`));
                    resolve(false);
                    return;
                }

                const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
                    const bytes = new Uint8Array(buffer);
                    const chunkSize = 0x8000;
                    let binary = "";
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                    }
                    return btoa(binary);
                };

                const inferMime = (file: File) => {
                    if (file.type) return file.type;
                    const name = (file.name || "").toLowerCase();
                    if (name.endsWith(".glb")) return "model/gltf-binary";
                    if (name.endsWith(".gltf")) return "model/gltf+json";
                    if (name.endsWith(".fbx")) return "application/octet-stream";
                    if (name.endsWith(".obj")) return "text/plain";
                    if (name.endsWith(".zip")) return "application/zip";
                    return "application/octet-stream";
                };

                onProgress?.(5);
                Promise.all(files.map(async (file) => {
                    const buf = await file.arrayBuffer();
                    const base64 = arrayBufferToBase64(buf);
                    const mime = inferMime(file);
                    return {
                        fileName: file.name,
                        mime,
                        dataUrl: `data:${mime};base64,${base64}`
                    };
                })).then(async (payloadFiles) => {
                    onProgress?.(85);
                    const res = await AuthFetchUtil.post("/api/model/upload", {files: payloadFiles, id});
                    if (res === true || (Array.isArray(res) && res.length === files.length)) {
                        onProgress?.(100);
                        resolve(true);
                    } else {
                        if (res !== null) globalMessage.messageApi?.error(tx("上传失败"));
                        resolve(false);
                    }
                }).catch((error) => {
                    globalMessage.messageApi?.error(tx("上传失败"));
                    console.error(error);
                    resolve(false);
                });
                return;
            }

            const formData = new FormData();
            files.forEach((file) => {
                formData.append("files", file);
            });
            if (id) formData.append("id", id);

            const token = AuthTools.getToken();
            axios.post("/api/model/upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    "Authorization": token ? `Bearer ${token}` : ""
                },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total && onProgress) {
                        onProgress((progressEvent.loaded / progressEvent.total) * 100);
                    }
                }
            }).then((response) => {
                if (response.status === 200) {
                    const res = response.data;
                    if (res.code === 200 && Array.isArray(res.data) && res.data.length === files.length) {
                        resolve(true);
                    } else {
                        globalMessage.messageApi?.error(tx(res.code === 200 ? "上传失败" : (res.msg || "上传失败")));
                        resolve(false);
                    }
                } else {
                    globalMessage.messageApi?.error(tx(`上传失败: ${response.statusText}`));
                    resolve(false);
                }
            }).catch((error) => {
                globalMessage.messageApi?.error(tx("网络错误，上传失败"));
                console.error(error);
                resolve(false);
            });
        });
    };

    const handleUpload = () => {
        if (fileList.length === 0 || uploadInFlight.current) return;

        uploadInFlight.current = true;
        setUploading(true);
        setUploadProgress(0);
        const files = fileList.map((file) => file.originFileObj as File).filter(Boolean);
        uploadAction(files, currentItem.id, setUploadProgress).then((res) => {
            if (res) {
                globalMessage.messageApi?.success(tx("操作成功"));
                setFileList([]);
                threeDModelResourceStore.setModalVisible(false);
                threeDModelResourceStore.getList();
            }
        }).finally(() => {
            uploadInFlight.current = false;
            setUploading(false);
            setUploadProgress(0);
        });
    };

    const closeUploadModal = () => {
        if (uploading) return;
        threeDModelResourceStore.setModalVisible(false);
        setFileList([]);
        setUploadProgress(0);
    };

    const renderModelCard = (item: IThreeDModelResource, index: number) => {
        const id = item.id;
        const typeLabel = getModelType(item);
        const zipCard = isZipModel(item);
        const isSelected = selectedIds.includes(id || "");
        const menuItems: DropdownMenuItem[] = [
            {
                key: "rename",
                label: "重命名",
                icon: <Edit />,
                onClick: ({domEvent}) => {
                    domEvent.stopPropagation();
                    handleRename(item);
                }
            },
            {
                key: "copy",
                label: "复制链接",
                icon: <Copy />,
                onClick: ({domEvent}) => handleCopyUrl(domEvent as unknown as MouseEvent, item.url)
            },
            {
                key: "delete",
                label: "删除",
                icon: <Delete />,
                danger: true,
                onClick: ({domEvent}) => handleSingleDelete(domEvent as unknown as MouseEvent, id)
            }
        ];

        return (
            <article
                key={id || `${item.url}-${index}`}
                className={`${styles.modelCard} ${zipCard ? styles.redCard : styles.greenCard} ${isSelected ? styles.selectedCard : ""}`}
                onClick={() => toggleSelection(id)}
            >
                <div className={styles.thumbnailWrap}>
                    <img className={styles.thumbnailImage} src={zipCard ? thumbRed : thumbGreen} alt="" />
                    <div className={styles.typeTag}>{typeLabel}</div>
                </div>

                <div className={styles.cardInfo}>
                    <div className={styles.fileInfo}>
                        <h2 title={getDisplayName(item)} data-datavisool-i18n-skip={item.name?.trim() ? "true" : undefined}>{getDisplayName(item)}</h2>
                        <p>
                            <span>{formatFileSize(item.size)}</span>
                            <span className={styles.dot} />
                            <span>{typeLabel}</span>
                        </p>
                    </div>
                    <Dropdown menu={{items: menuItems}} trigger={["click"]} placement="bottomRight">
                        <button
                            type="button"
                            className={styles.moreButton}
                            aria-label="更多操作"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <More size={22} />
                        </button>
                    </Dropdown>
                </div>

                <div className={styles.actionBar}>
                    <button type="button" onClick={(event) => {
                        event.stopPropagation();
                        handleRename(item);
                    }}>
                        <Edit size={18} />
                        <span>编辑</span>
                    </button>
                    <button type="button" onClick={(event) => openReplaceModal(event, item)}>
                        <Refresh size={18} />
                        <span>替换</span>
                    </button>
                    <button type="button" className={styles.deleteAction} onClick={(event) => handleSingleDelete(event, id)}>
                        <Delete size={18} />
                        <span>删除</span>
                    </button>
                </div>
            </article>
        );
    };

    return (
        <div className={styles.modelResourcePage}>
            <header className={styles.pageHeader}>
                <div className={styles.headerTitleArea}>
                    <span className={styles.titleIcon}>
                        <Cube size={56} fill="#6e8dff" />
                    </span>
                    <div className={styles.titleText}>
                        <h1>3D模型资源管理</h1>
                        <p>集中管理和维护所有3D模型资源，便于高效复用与协作</p>
                    </div>
                </div>

                <div className={styles.headerTools}>
                    <Input
                        className={styles.searchInputField}
                        controlClassName={styles.searchInput}
                        placeholder="搜索模型名称"
                        prefix={<Search size={20} fill="#9EABC8" />}
                        onPressEnter={(event) => doSearch(event.currentTarget.value)}
                    />
                    <Button
                        className={styles.uploadButton}
                        type="primary"
                        icon={<Upload size={18} />}
                        onClick={openUploadModal}
                    >
                        上传模型
                    </Button>
                    <Button
                        className={styles.deleteButton}
                        type="default"
                        icon={<Delete size={18} />}
                        onClick={handleBatchDelete}
                    >
                        删除
                    </Button>
                </div>
            </header>

            <main className={styles.pageBody}>
                <section className={styles.resourcePane}>
                    {records.length === 0 ? (
                        <div className={styles.emptyWrap}>
                            <Empty title={null} description="暂无3D模型资源">
                                <Button
                                    className={styles.uploadButton}
                                    type="primary"
                                    icon={<Upload size={16} />}
                                    onClick={openUploadModal}
                                >
                                    上传模型
                                </Button>
                            </Empty>
                        </div>
                    ) : (
                        <div className={styles.modelGrid}>
                            {records.map((item, index) => renderModelCard(item, index))}
                        </div>
                    )}

                    <div className={styles.paginationContainer}>
                        <Pagination
                            current={current}
                            pageSize={size}
                            total={total}
                            onChange={(page) => threeDModelResourceStore.changeCurrentPage(page)}
                            showSizeChanger={false}
                            showTotal={(totalCount, range) => `第 ${range[0]}-${range[1]} 条，共 ${totalCount} 条`}
                            controlClassName={styles.pagination}
                        />
                    </div>
                </section>

            </main>

            <Dialog
                open={modalVisible}
                title={currentItem.id ? "替换模型" : "上传模型"}
                onClose={closeUploadModal}
                width={520}
                mask
                centered
                showClose
                className={styles.uploadModal}
            >
                <Dragger
                    multiple={!currentItem.id}
                    maxCount={currentItem.id ? 1 : 10}
                    accept=".glb,.gltf,.fbx,.obj,.zip"
                    fileList={fileList}
                    beforeUpload={(file: File) => {
                        const isSupported = /\.(glb|gltf|fbx|obj|zip)$/i.test(file.name);
                        if (!isSupported) {
                            globalMessage.messageApi?.warning(tx("仅支持 .glb、.gltf、.fbx、.obj 或 .zip 文件"));
                            return DatavisoolUpload.LIST_IGNORE;
                        }
                        if (file.size === 0) {
                            globalMessage.messageApi?.error(tx("模型文件不能为空"));
                            return DatavisoolUpload.LIST_IGNORE;
                        }
                        setFileList((prev) => [
                            ...(currentItem.id ? [] : prev),
                            {
                                uid: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                name: file.name,
                                status: "done",
                                originFileObj: file,
                            }
                        ]);
                        return false;
                    }}
                    onRemove={(file) => {
                        setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
                    }}
                    className={styles.uploadDragger}
                    disabled={uploading}
                >
                    <Upload fill="#7785A7" size={28} />
                    <p className={styles.uploadText}>支持 .glb、.gltf、.fbx、.obj 或 .zip 多文件模型</p>
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
                        {uploading ? "上传中..." : currentItem.id ? "替换" : "上传模型"}
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

export default ThreeDModelResourceManagement;
