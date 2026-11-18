/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createEventKey} from '../../plugin.js';

export type LocaleCode = 'zh-CN' | 'en-US';

export interface I18nService {
    readonly availableLocales: readonly LocaleCode[];
    getLocale(): LocaleCode;
    translate(source: string): string;
    setLocale(locale: LocaleCode): LocaleCode;
}

/** Emitted after the locale is updated. */
export const localeChangedKey = createEventKey<{readonly locale: LocaleCode}>('i18n/locale-changed');

declare module '../../plugin.js' {
    interface PluginServices {
        i18n: I18nService;
    }
}
