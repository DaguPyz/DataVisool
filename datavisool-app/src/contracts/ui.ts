/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ReactNode} from 'react';
import {createServiceKey} from '@/visloom/index.ts';

export interface RootProvidersProps {
    readonly renderContent: () => ReactNode;
}

export interface UiService {
    /** Attach the root view after all startup plugins have activated. */
    mount(container: HTMLElement): void;
}

export const uiKey = createServiceKey<UiService>('app/ui');
