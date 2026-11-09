/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

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

export const USER_INFO_KEY = 'DATAVISOOL_USER_INFO';

export default class AuthTools {

    private static userInfo: IUserInfo | null = null;

    private static flash: boolean = false;

    public static getToken(): string | null {
        if (AuthTools.userInfo !== null && !AuthTools.flash)
            return AuthTools.userInfo.token;
        const userInfo = AuthTools.getUserInfo();
        if (userInfo === null)
            return null;
        return userInfo.token;
    }

    public static removeUser(): void {
        localStorage.removeItem('token');
        localStorage.removeItem(USER_INFO_KEY);
        AuthTools.userInfo = null;
    }


    public static getUserId(): string | null {
        const userInfo = AuthTools.getUserInfo();
        if (userInfo === null)
            return null;
        return userInfo.id;
    }

    public static setUserInfo(userInfo: IUserInfo, flash?: boolean): void {
        localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
        if (flash)
            AuthTools.flash = flash;
    }

    public static getUserInfo(): IUserInfo | null {
        if (AuthTools.userInfo !== null && !AuthTools.flash)
            return AuthTools.userInfo;
        const userInfo = localStorage.getItem(USER_INFO_KEY);
        if (userInfo === null)
            return null;
        const info: IUserInfo = JSON.parse(userInfo);
        AuthTools.userInfo = info;
        AuthTools.flash = false;
        return info;
    }
}
