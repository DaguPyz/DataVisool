/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import AuthTools, {RoleType, USER_INFO_KEY} from '@/util/AuthTools';

describe('Web authentication tools', () => {
    let values: Map<string, string>;

    beforeEach(() => {
        values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        });
        AuthTools.removeUser();
    });

    afterEach(() => {
        AuthTools.removeUser();
        vi.unstubAllGlobals();
    });

    it('stores, refreshes and clears the signed-in user and token', () => {
        const user = {id: '1', name: 'User', username: 'user', token: 'token-1', roles: [RoleType.USER]};
        AuthTools.setUserInfo(user, true);
        expect(AuthTools.getUserId()).toBe('1');
        expect(AuthTools.getToken()).toBe('token-1');
        expect(JSON.parse(values.get(USER_INFO_KEY)!)).toEqual(user);

        AuthTools.setUserInfo({...user, token: 'token-2'}, true);
        expect(AuthTools.getToken()).toBe('token-2');
        AuthTools.removeUser();
        expect(AuthTools.getUserInfo()).toBeNull();
        expect(AuthTools.getToken()).toBeNull();
        expect(values.has(USER_INFO_KEY)).toBe(false);
    });
});
