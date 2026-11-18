/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createEventKey} from '../../plugin.js';

export type BrandLogo = 'main' | 'icon';

export const brandLogoChangedKey = createEventKey<BrandLogo>('app/brand/logo-changed');
