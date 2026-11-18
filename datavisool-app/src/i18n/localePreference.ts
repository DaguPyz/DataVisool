/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {LocaleCode} from '@datavisool/sdk/plugin/contracts/i18n';

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN';
export const LOCALE_STORAGE_KEY = 'datavisool-i18n-locale';
export const AVAILABLE_LOCALES: readonly LocaleCode[] = Object.freeze(['zh-CN', 'en-US']);

export const isLocaleCode = (locale: string | null | undefined): locale is LocaleCode => (
    AVAILABLE_LOCALES.includes(locale as LocaleCode)
);

const normalizeSystemLocale = (locale: string | null | undefined): LocaleCode | null => {
    if (!locale)
        return null;
    const normalized = locale.toLowerCase();
    if (normalized.startsWith('zh'))
        return 'zh-CN';
    if (normalized.startsWith('en'))
        return 'en-US';
    return null;
};

const readSystemLocale = (): LocaleCode => {
    if (typeof navigator === 'undefined')
        return DEFAULT_LOCALE;
    const systemLocales = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
    for (const locale of systemLocales) {
        const matchedLocale = normalizeSystemLocale(locale);
        if (matchedLocale)
            return matchedLocale;
    }
    return DEFAULT_LOCALE;
};

export const readInitialLocale = (): LocaleCode => {
    if (typeof window === 'undefined')
        return readSystemLocale();
    try {
        const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        return isLocaleCode(storedLocale) ? storedLocale : readSystemLocale();
    } catch (e) {
        console.warn('[i18n] read locale failed', e);
        return readSystemLocale();
    }
};
