/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useSyncExternalStore, type ReactNode} from 'react';
import {DataVisoolUIProvider} from '@datavisool/ui';
import type {I18nBinding} from './i18nBinding.ts';
import {readInitialLocale} from './localePreference.ts';

const subscribeWithoutI18n = () => () => {};

export function LocalizedUiProvider({binding, children}: {binding?: I18nBinding; children: ReactNode}) {
    const locale = useSyncExternalStore(
        binding?.subscribeLocale ?? subscribeWithoutI18n,
        binding?.i18n.getLocale ?? readInitialLocale,
    );
    return <DataVisoolUIProvider locale={locale} translate={binding?.i18n.translate}>{children}</DataVisoolUIProvider>;
}
