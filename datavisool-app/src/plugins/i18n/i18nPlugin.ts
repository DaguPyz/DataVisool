/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {Plugin} from '@datavisool/sdk/plugin';
import {localeChangedKey, type I18nService, type LocaleCode} from '@datavisool/sdk/plugin/contracts/i18n';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn.js';
import {AVAILABLE_LOCALES, isLocaleCode, LOCALE_STORAGE_KEY, readInitialLocale} from '../../i18n/localePreference.ts';
import {createDomTranslator} from './domTranslator.ts';
import {translateText} from './translate.ts';

interface LegacyI18nApi {
    availableLocales: LocaleCode[];
    getLocale(): LocaleCode;
    setLocale(locale: string): LocaleCode;
    t(key: string, fallback?: string): string;
    tx(source: string): string;
    translateDom(root?: ParentNode): void;
}

declare global {
    interface Window {
        lcI18n?: LegacyI18nApi;
    }
}

/**
 * 管理界面语言和词典。其他插件通过 `i18n` 翻译文案并监听语言变化。
 * @pluginDocs
 */
export function createI18nPlugin(): Plugin {
    return {
        id: 'i18n',
        requires: [],
        provides: ['i18n'],
        activate(context) {
            const browser = typeof window === 'undefined' ? undefined : window;
            let locale = readInitialLocale();
            let active = true;
            const previousDateLocale = dayjs.locale();
            const syncDateLocale = () => dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');

            const service: I18nService = {
                availableLocales: AVAILABLE_LOCALES,
                getLocale: () => locale,
                translate: source => translateText(locale, source),
                setLocale(nextLocale) {
                    if (!active || nextLocale === locale) return locale;
                    if (!isLocaleCode(nextLocale)) {
                        console.warn(`[i18n] unsupported locale: ${nextLocale}`);
                        return locale;
                    }
                    locale = nextLocale;
                    if (browser) {
                        try {
                            browser.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
                        } catch (error) {
                            console.warn('[i18n] persist locale failed', error);
                        }
                    }
                    syncDateLocale();
                    domTranslator?.refresh();
                    void context.emit(localeChangedKey, {locale}).catch(error => {
                        console.error('[i18n] locale change notification failed', error);
                    });
                    browser?.dispatchEvent(new browser.CustomEvent('datavisool-i18n-locale-change', {detail: {locale}}));
                    return locale;
                },
            };
            const domTranslator = browser && createDomTranslator(browser, service);

            context.onStop({
                pause() { active = false; },
                cancel() { active = true; },
            });
            context.onDispose(() => {
                active = false;
                domTranslator?.dispose();
                dayjs.locale(previousDateLocale);
            });
            syncDateLocale();

            if (browser && domTranslator) {
                const previousApi = browser.lcI18n;
                const legacyApi: LegacyI18nApi = {
                    availableLocales: [...service.availableLocales],
                    getLocale: service.getLocale,
                    setLocale: value => isLocaleCode(value) ? service.setLocale(value) : service.getLocale(),
                    t: (key, fallback) => service.translate(fallback ?? key),
                    tx: service.translate,
                    translateDom: domTranslator.translateDom,
                };
                context.onDispose(() => {
                    if (browser.lcI18n !== legacyApi) return;
                    if (previousApi === undefined) delete browser.lcI18n;
                    else browser.lcI18n = previousApi;
                });
                domTranslator.start();
                browser.lcI18n = legacyApi;
            }
            context.provide('i18n', service);
        },
    };
}
