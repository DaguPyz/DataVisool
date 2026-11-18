/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {RootProvidersProps} from '@datavisool/sdk/plugin/contracts/ui';
import {LocalizedUiProvider} from '@/i18n/LocalizedUiProvider.tsx';
import type {I18nBinding} from '@/i18n/i18nBinding.ts';

export function AppProviders({renderContent, ...binding}: RootProvidersProps & I18nBinding) {
    return <LocalizedUiProvider binding={binding}>{renderContent()}</LocalizedUiProvider>;
}
