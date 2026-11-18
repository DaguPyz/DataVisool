/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "../util/AuthFetchUtil.ts";

export interface IRole {
    id: string;
    name: string;
    description: string;
}

export const quickSearchRole = async (keywords: string = '', options?: AuthRequestInit) => {
    return await AuthFetchUtil.get<IRole[]>(`/api/role/quickSearch?keywords=${keywords}`, options);
}


export const getRoles = async (ids: string[], options?: AuthRequestInit) => {
    return await AuthFetchUtil.post<IRole[]>(`/api/role/listByIds`, ids, options);
}

