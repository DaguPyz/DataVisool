/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil from "../util/AuthFetchUtil.ts";

export interface IRole {
    id: string;
    name: string;
    description: string;
}

export const quickSearchRole = async (keywords: string = '') => {
    return await AuthFetchUtil.get<IRole[]>(`/api/role/quickSearch?keywords=${keywords}`);
}


export const getRoles = async (ids: string[]) => {
    return await AuthFetchUtil.post<IRole[]>(`/api/role/listByIds`, ids);
}

