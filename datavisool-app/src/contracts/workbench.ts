/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ReactNode} from 'react';
import type {NonIndexRouteObject} from 'react-router-dom';
import {createServiceKey} from '@/visloom/index.ts';
import type {RoleType} from './session.ts';
import type {RouteRegistration} from './ui.ts';

export interface WorkbenchMenuGroup {
    readonly key: string;
    readonly label: string;
    readonly order: number;
    readonly icon?: ReactNode;
}

export interface WorkbenchPage {
    readonly route: NonIndexRouteObject & {readonly path: string};
    readonly menu?: {
        readonly label: string;
        readonly order: number;
        readonly icon?: ReactNode;
        readonly group?: WorkbenchMenuGroup;
        readonly roles?: readonly RoleType[];
    };
    readonly accountMenuLabel?: string;
}

export interface WorkbenchService {
    /** Register routes relative to /home and their corresponding menu entries before UI mount. */
    registerPages(pages: readonly WorkbenchPage[]): RouteRegistration;
}

export const workbenchKey = createServiceKey<WorkbenchService>('app/workbench');
