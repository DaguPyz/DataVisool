/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 重试函数，每隔interval毫秒尝试执行fn，最多尝试maxAttempts次
 * @param fn 待执行的函数, 返回true表示成功,停止重试，返回false表示失败继续重试
 * @param maxAttempts 最大尝试次数
 * @param interval 重试间隔时间
 */
export function retryWithInterval(
    fn: () => boolean | Promise<boolean>,
    maxAttempts: number,
    interval: number
): Promise<boolean> {
    return new Promise((resolve) => {
        let attempts = 0;

        const timer = setInterval(async () => {
            attempts++;
            try {
                const result = await fn();
                if (result) {
                    clearInterval(timer); // 成功后清理定时器
                    resolve(true);
                    return;
                }
            } catch {
                // 忽略错误，继续重试
            }

            if (attempts >= maxAttempts) {
                clearInterval(timer);
                resolve(false);
            }
        }, interval);
    });
}
