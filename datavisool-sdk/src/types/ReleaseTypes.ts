/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 发布设置类型定义
 */
export interface IProjectRelease {
    // 是否加密
    encrypt?: boolean;
    // 密码
    password?: string;
    // 有效期（为null表示永久有效）
    expirationDate?: number;
}
