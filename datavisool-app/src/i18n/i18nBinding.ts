/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {PluginContext} from '@datavisool/sdk/plugin';
import {localeChangedKey, type I18nService, type LocaleCode} from '@datavisool/sdk/plugin/contracts/i18n';

export interface I18nBinding {
    readonly i18n: I18nService;
    readonly subscribeLocale: (listener: (locale: LocaleCode) => void) => () => void;
}

/** Pass the capability and its Visloom subscription to code outside a plugin's activate callback. */
export function createI18nBinding(context: PluginContext): I18nBinding {
    return {
        i18n: context.i18n,
        subscribeLocale: listener => context.on(localeChangedKey, ({locale}) => listener(locale)),
    };
}
