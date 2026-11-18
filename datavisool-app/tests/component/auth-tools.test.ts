/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {RoleType} from '@datavisool/sdk/plugin/contracts/session';
import {createSessionPlugin} from '@/plugins/session/sessionPlugin.ts';
import AuthTools, {bindLegacySession} from '@/util/AuthTools.ts';
import {Visloom} from '@/visloom/index.ts';

const USER_INFO_KEY = 'DATAVISOOL_USER_INFO';

describe('Web authentication tools', () => {
    let values: Map<string, string>;
    let runtime: Visloom;

    beforeEach(async () => {
        values = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        });
        runtime = new Visloom();
        await runtime.start([
            createSessionPlugin(),
            {
                id: 'legacy-auth-consumer',
                requires: ['session'],
                provides: [],
                activate(context) {
                    context.onDispose(bindLegacySession(() => context.session));
                },
            },
        ]);
    });

    afterEach(async () => {
        await runtime.stop();
        vi.unstubAllGlobals();
    });

    it('stores, refreshes and clears the signed-in user and token', () => {
        const user = {id: '1', name: 'User', username: 'user', token: 'token-1', roles: [RoleType.USER]};
        const session = runtime.get('session');
        values.set(USER_INFO_KEY, JSON.stringify(user));
        expect(AuthTools.getUserId()).toBe('1');
        expect(AuthTools.getToken()).toBe('token-1');

        session.setUserInfo({...user, token: 'token-2'});
        expect(AuthTools.getToken()).toBe('token-2');
        AuthTools.setUserInfo(user);
        expect(session.getUserInfo()).toEqual(user);
        AuthTools.removeUser();
        expect(AuthTools.getUserInfo()).toBeNull();
        expect(AuthTools.getToken()).toBeNull();
        expect(values.has(USER_INFO_KEY)).toBe(false);
    });
});
