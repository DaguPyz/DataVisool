/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {sessionKey, type IUserInfo} from '@/contracts/session.ts';
import type {Plugin} from '@/visloom/index.ts';

const USER_INFO_KEY = 'DATAVISOOL_USER_INFO';

export function createSessionPlugin(): Plugin {
    return {
        id: 'session',
        requires: [],
        provides: [sessionKey],
        activate(context) {
            context.provide(sessionKey, {
                getUserInfo() {
                    const storedUser = localStorage.getItem(USER_INFO_KEY);
                    return storedUser === null ? null : JSON.parse(storedUser) as IUserInfo;
                },
                setUserInfo(userInfo) {
                    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
                },
                removeUser() {
                    localStorage.removeItem('token');
                    localStorage.removeItem(USER_INFO_KEY);
                },
            });
        },
    };
}
