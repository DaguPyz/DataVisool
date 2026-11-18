/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType, ReactNode} from 'react';
import {createServiceKey} from '@/visloom/index.ts';

export interface HomeLayoutProps {
    readonly navigation: ReactNode;
    readonly content: ReactNode;
}

export interface HomeLayoutService {
    readonly Layout: ComponentType<HomeLayoutProps>;
}

export const homeLayoutKey = createServiceKey<HomeLayoutService>('app/home-layout');
