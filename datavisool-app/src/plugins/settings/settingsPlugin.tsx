/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Setting as SettingsIcon} from '@icon-park/react';
import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {brandLogoChangedKey, type BrandLogo} from '@datavisool/sdk/plugin/contracts/brand';
import {RoleType} from '@datavisool/sdk/plugin/contracts/session';
import {createSessionRequestOptions} from '@/api/sessionRequestOptions.ts';
import {createI18nBinding} from '@/i18n/i18nBinding.ts';
import {registerWorkbenchPage, workbenchIconProps} from '@/shared/workbench/registerWorkbenchPage.ts';

const Setting = lazy(() => import('./Setting.tsx'));

export function createSettingsPlugin(): Plugin {
    return {
        id: 'settings',
        requires: ['i18n', 'navigation', 'router', 'session', 'workbench'],
        provides: [],
        activate(context) {
            const i18n = createI18nBinding(context);
            const requestOptions = createSessionRequestOptions(context);
            const session = context.session;
            const pendingWrites = new Set<Promise<unknown>>();
            let acceptingOperations = true;
            const canOperate = () => acceptingOperations;
            const trackWrite = async <T,>(request: Promise<T>): Promise<T> => {
                pendingWrites.add(request);
                try {
                    return await request;
                } finally {
                    pendingWrites.delete(request);
                }
            };
            const onBrandLogoChanged = (logo: BrandLogo) => {
                if (canOperate()) {
                    void context.emit(brandLogoChangedKey, logo).catch(error => console.error('Brand update notification failed.', error));
                }
            };
            context.onStop({
                pause() { acceptingOperations = false; },
                async prepare() { await Promise.allSettled(pendingWrites); },
                cancel() { acceptingOperations = true; },
            });
            context.onDispose(() => { acceptingOperations = false; });

            const routeId = 'app:settings';
            registerWorkbenchPage(context, {
                id: routeId, path: 'setting',
                render: () => <Setting {...i18n} session={session} requestOptions={requestOptions} trackWrite={trackWrite}
                                        canOperate={canOperate} onBrandLogoChanged={onBrandLogoChanged}/>,
            }, {label: '设置', order: 90, icon: <SettingsIcon {...workbenchIconProps}/>, roles: [RoleType.SYSTEM_ADMIN]}, [
                {id: 'app:user-info', path: 'userInfo', redirectTo: '../setting'},
            ]);
            const account = context.workbench.registerAccountEntries([{routeId, label: '账号设置'}]);
            context.onStop(account);
            context.onDispose(account.dispose);
        },
    };
}
