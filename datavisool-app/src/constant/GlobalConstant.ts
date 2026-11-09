/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 保存组件属性时，若属性值为函数，则需要添加上此前缀，便于后续反序列化还原函数
 */
export const CONFIG_FUNC_PREFIX = 'CONFIG_FUNC_PREFIX::';

export const PIXEL_BOUNDARY_VALUE = 22369618;