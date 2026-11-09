/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import localforage from 'localforage';
import {Base64Util} from "@datavisool/sdk";

let autoSaveTimer: number | null = null;

// 初始配置
localforage.config({
    name: 'AutoSaveDB',
    storeName: 'autosave_store'
});

// 保存结构类型
export interface IAutoSaveData {
    encoded: string;
    meta: Record<string, any>;
    saveTime: number;
}

const MAX_LIST_SIZE = 10;

/**
 * 获取当前 key 下的保存列表
 */
async function getSaveList(key: string): Promise<IAutoSaveData[]> {
    const list = await localforage.getItem<IAutoSaveData[]>(key);
    return Array.isArray(list) ? list : [];
}

/**
 * 追加保存项（自动裁剪只保留最多 10 条）
 */
async function appendToSaveList(key: string, item: IAutoSaveData) {
    const list = await getSaveList(key);
    list.push(item);

    // 超过最大长度，移除旧数据
    while (list.length > MAX_LIST_SIZE) {
        list.shift();
    }

    await localforage.setItem(key, list);
}

/**
 * 开启自动保存（列表模式）
 */
export function startAutoSave(
    key: string,
    interval: number,
    dataProvider: () => string,
    metaProvider?: () => Record<string, any>
) {
    stopAutoSave();
    autoSaveTimer = window.setInterval(async () => {
        const raw = dataProvider();
        const encoded = Base64Util.toBase64(raw);
        const metadata = metaProvider ? metaProvider() : {};

        const saveItem: IAutoSaveData = {
            encoded,
            meta: metadata,
            saveTime: Date.now()
        };

        await appendToSaveList(key, saveItem);
    }, interval);
}

/**
 * 停止自动保存
 */
export function stopAutoSave() {
    if (autoSaveTimer !== null) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

/**
 * 恢复列表（返回全部历史记录）
 */
export async function restoreAutoSave(
    key: string
): Promise<Array<{
    content: string;
    meta: Record<string, any>;
    saveTime: number;
}>> {
    const list = await getSaveList(key);
    if (!list.length) {
        return [];
    }

    return list.map(item => ({
        content: Base64Util.fromBase64(item.encoded),
        meta: item.meta,
        saveTime: item.saveTime
    }));
}

/**
 * 单次保存（手动触发）
 */
export async function singleSave(
    key: string,
    dataProvider: () => string,
    metaProvider?: () => Record<string, any>
) {
    const raw = dataProvider();
    const encoded = Base64Util.toBase64(raw);
    const metadata = metaProvider ? metaProvider() : {};

    const saveItem: IAutoSaveData = {
        encoded,
        meta: metadata,
        saveTime: Date.now()
    };

    await appendToSaveList(key, saveItem);
}
