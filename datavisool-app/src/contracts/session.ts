/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createEventKey, createServiceKey} from '@/visloom/index.ts';

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
    /** End the current server session. Returns false if cancelled or the session was replaced. */
    logout(signal: AbortSignal): Promise<boolean>;
}

export const sessionKey = createServiceKey<SessionService>('app/session');
export const sessionChangedKey = createEventKey<void>('app/session/changed');
