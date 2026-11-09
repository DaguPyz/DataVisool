/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {singleSave} from "./AutoSaveManager.ts";
import {getSaveData} from "@/designer/operate-provider/hot-key/HotKeyImpl.ts";

export default function enhanceFetch() {
    const originalFetch = window.fetch;
    //只在编辑模式下增强
    if (window.location.pathname === "/designer") {
        /**
         * 增强版 fetch：
         * - 如果请求抛错（网络错误、断网、被阻止等），自动执行备份逻辑
         */
        window.fetch = async function enhancedFetch(input: RequestInfo | URL, init?: RequestInit) {
            try {
                return await originalFetch(input, init);
            } catch (err) {
                console.error("Fetch Error:", err);
                singleSave(`DATAVISOOL_${window.DATAVISOOL_ENV.projectId}`,
                    () => JSON.stringify(getSaveData()),
                    () => ({id: window.DATAVISOOL_ENV.projectId, name: '紧急错误备份'})).then(() => {
                    //存储错误备份标识
                    localStorage.setItem(`PROJECT_ERROR_${window.DATAVISOOL_ENV.projectId}`, "1");
                })
                // 再把错误继续抛出去
                throw err;
            }
        };
    }
}


