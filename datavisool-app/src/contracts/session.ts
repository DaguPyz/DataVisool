/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createServiceKey} from '@/visloom/index.ts';

export interface IUserInfo {
    id: string;
    name: string;
    username: string;
    avatar?: string;
    phone?: string;
    email?: string;
    token: string;
    roles: RoleType[];
}

export enum RoleType {
    SYSTEM_ADMIN = 'ROLE_SYSTEM_ADMIN',
    ADMIN = 'ROLE_ADMIN',
    USER = 'ROLE_USER'
}

export interface SessionService {
    getUserInfo(): IUserInfo | null;
    setUserInfo(userInfo: IUserInfo): void;
    removeUser(): void;
}

export const sessionKey = createServiceKey<SessionService>('app/session');
