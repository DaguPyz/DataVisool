/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {sessionChangedKey, type IUserInfo} from '@datavisool/sdk/plugin/contracts/session';
import FetchUtil from '@/util/FetchUtil.ts';
import type {Plugin} from '@datavisool/sdk/plugin';

const USER_INFO_KEY = 'DATAVISOOL_USER_INFO';

export function createSessionPlugin(): Plugin {
    return {
        id: 'session',
        requires: [],
        provides: ['session'],
        activate(context) {
            const notifyChanged = () => {
                void context.emit(sessionChangedKey, undefined).catch(error => console.error('Session update notification failed.', error));
            };
            const getUserInfo = () => {
                const storedUser = localStorage.getItem(USER_INFO_KEY);
                return storedUser === null ? null : JSON.parse(storedUser) as IUserInfo;
            };
            const removeUser = () => {
                localStorage.removeItem('token');
                localStorage.removeItem(USER_INFO_KEY);
                notifyChanged();
            };

            context.provide('session', {
                getUserInfo,
                setUserInfo(userInfo) {
                    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
                    notifyChanged();
                },
                removeUser,
                async logout(signal) {
                    if (signal.aborted) return false;
                    const token = getUserInfo()?.token;
                    if (!token) return true;

                    const response = await FetchUtil.doRequest('/api/authenticate/logout', 'POST', {
                        Authorization: `Bearer ${token}`,
                    }, {}, {signal});
                    if (signal.aborted || getUserInfo()?.token !== token) return false;
                    if (response.code !== 200 && response.code !== 10002) {
                        throw new Error(response.msg || 'Could not log out.');
                    }
                    removeUser();
                    return true;
                },
            });
        },
    };
}
