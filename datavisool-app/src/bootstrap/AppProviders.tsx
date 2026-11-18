/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {DataVisoolUIProvider} from '@datavisool/ui';
import dayjs from 'dayjs';
import {getLocale, tx} from '@/i18n/miniI18n.ts';
import {useLocaleVersion} from '@/i18n/useLocaleVersion.ts';
import type {RootProvidersProps} from '@datavisool/sdk/plugin/contracts/ui';

export function AppProviders({renderContent}: RootProvidersProps) {
    useLocaleVersion();
    const locale = getLocale();
    dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');

    return <DataVisoolUIProvider locale={locale} translate={tx}>{renderContent()}</DataVisoolUIProvider>;
}
