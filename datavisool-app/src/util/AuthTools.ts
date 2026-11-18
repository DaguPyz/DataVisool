/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {IUserInfo, SessionService} from '@datavisool/sdk/plugin/contracts/session';

export {RoleType, type IUserInfo} from '@datavisool/sdk/plugin/contracts/session';

let getSession: (() => SessionService) | undefined;

/** Adapt legacy route code to the session capability resolved by its plugin context. */
export function bindLegacySession(resolve: () => SessionService): () => void {
    getSession = resolve;
    return () => {
        if (getSession === resolve) getSession = undefined;
    };
}

export default class AuthTools {
    public static getToken(): string | null {
        return AuthTools.getUserInfo()?.token ?? null;
    }

    public static removeUser(): void {
        getSession?.().removeUser();
    }

    public static getUserId(): string | null {
        return AuthTools.getUserInfo()?.id ?? null;
    }

    public static setUserInfo(userInfo: IUserInfo): void {
        getSession?.().setUserInfo(userInfo);
    }

    public static getUserInfo(): IUserInfo | null {
        return getSession?.().getUserInfo() ?? null;
    }
}
