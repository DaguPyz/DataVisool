/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {LocaleCode} from '@datavisool/sdk/plugin/contracts/i18n';
import type {I18nBinding} from './i18nBinding.ts';
import {readInitialLocale} from './localePreference.ts';

let binding: I18nBinding | undefined;

/** Adapt legacy pages and imperative designer code to the registered i18n capability. */
export function bindLegacyI18n(next: I18nBinding): () => void {
    binding = next;
    return () => {
        if (binding === next) binding = undefined;
    };
}

export const getLegacyI18nBinding = (): I18nBinding | undefined => binding;
export const getLocale = (): LocaleCode => binding?.i18n.getLocale() ?? readInitialLocale();
export const tx = (source: string): string => binding?.i18n.translate(source) ?? source;

export function subscribeLocaleChange(listener: (locale: LocaleCode) => void): () => void {
    return binding?.subscribeLocale(listener) ?? (() => {});
}
