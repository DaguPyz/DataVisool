/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseResourceStore, IBaseResource} from "@/shared/resources/BaseResourceStore.ts";
import {globalMessage} from "@datavisool/ui";
import axios, {AxiosError, AxiosProgressEvent, AxiosResponse} from "axios";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";

export interface IFont extends IBaseResource {
    key?: string;
    name?: string;
    url?: string;
}

export class FontManagementStore extends BaseResourceStore<IFont> {
    getListApiUrl = '/api/font/pageList';
    deleteApiUrl = '/api/font/batchDel';
    updateApiUrl = '/api/font/update';
    protected retainSearchValue = true;
    private readonly previewFonts = new Set<FontFace>();

    init() {
        this.pageData.size = 12;
        super.init();
    }

    destroy() {
        super.destroy();
        for (const font of this.previewFonts) document.fonts.delete(font);
        this.previewFonts.clear();
        this.pageData.size = 12;
    }

    protected processRecords(records: IFont[]) {
        super.processRecords(records);
        const context = this.captureRequestContext();
        // 异步加载字体
        records.forEach(item => {
            if (item.name && item.url) {
                const fontUrl = AssetUrlUtil.toLoadableUrl(item.url);
                const font = new FontFace(item.name, `url("${fontUrl}")`);
                font.load().then((loadedFont) => {
                    if (this.isRequestContextCurrent(context)) {
                        document.fonts.add(loadedFont);
                        this.previewFonts.add(loadedFont);
                    }
                }).catch(e => console.error(`Failed to load font ${item.name}`, e));
            }
        })
    }

    uploadFont = (files: File[], id?: string, onProgress?: (percent: number) => void): Promise<boolean> => {
        if (!this.services.canOperate()) return Promise.resolve(false);
        return new Promise((resolve) => {
            const isTauri = typeof window !== 'undefined' && (('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window));
            if (isTauri) {
                globalMessage.messageApi?.open({
                    key: 'uploadFont',
                    type: 'loading',
                    content: this.translate('正在上传字体...'),
                    duration: 0
                });

                const mapMime = (file: File) => {
                    if (file.type) return file.type;
                    const ext = file.name.toLowerCase().split('.').pop() || '';
                    if (ext === 'ttf') return 'font/ttf';
                    if (ext === 'otf') return 'font/otf';
                    if (ext === 'woff') return 'font/woff';
                    if (ext === 'woff2') return 'font/woff2';
                    if (ext === 'eot') return 'application/vnd.ms-fontobject';
                    return 'application/octet-stream';
                };

                const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
                    const bytes = new Uint8Array(buffer);
                    const chunkSize = 0x8000;
                    let binary = '';
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                    }
                    return btoa(binary);
                };

                Promise.all(
                    files.map(async (file) => {
                        const buf = await file.arrayBuffer();
                        const base64 = arrayBufferToBase64(buf);
                        const mime = mapMime(file);
                        return {
                            fileName: file.name,
                            dataUrl: `data:${mime};base64,${base64}`
                        };
                    })
                )
                    .then((fonts) => {
                        onProgress?.(90);
                        return this.services.post<any>('/api/font/upload', {fonts});
                    })
                    .then((res) => {
                        globalMessage.messageApi?.destroy('uploadFont');
                        if (res === true) {
                            onProgress?.(100);
                            resolve(true);
                        } else {
                            globalMessage.messageApi?.error(this.translate('上传失败'));
                            resolve(false);
                        }
                    })
                    .catch((error) => {
                        globalMessage.messageApi?.destroy('uploadFont');
                        globalMessage.messageApi?.error(this.translate('上传失败'));
                        console.error(error);
                        resolve(false);
                    });
                return;
            }

            const formData = new FormData();
            files.forEach(file => {
                formData.append('fontFile', file);
            });
            id && formData.append('id', id);

            const token = (this.services.session.getUserInfo()?.token ?? null);

            globalMessage.messageApi?.open({
                key: 'uploadFont',
                type: 'loading',
                content: this.translate('正在上传字体...'),
                duration: 0
            });

            this.services.trackWrite(axios.post('/api/font/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    if (progressEvent.total && onProgress) {
                        const percent = (progressEvent.loaded / progressEvent.total) * 100;
                        onProgress(percent);
                    }
                }
            })).then((response: AxiosResponse<any>) => {
                globalMessage.messageApi?.destroy('uploadFont');
                if (response.status === 200) {
                    const res = response.data;
                    if (res.code === 200 && res.data === true) {
                        resolve(true);
                    } else {
                        globalMessage.messageApi?.error(this.translate(res.code === 200 ? '上传失败' : (res.msg || '上传失败')));
                        resolve(false);
                    }
                } else {
                    globalMessage.messageApi?.error(this.translate(`上传失败: ${response.statusText}`));
                    resolve(false);
                }
            }).catch((error: AxiosError) => {
                globalMessage.messageApi?.destroy('uploadFont');
                globalMessage.messageApi?.error(this.translate('网络错误，上传失败'));
                console.error(error);
                resolve(false);
            });
        });
    }
}

