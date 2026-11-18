/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ReactNode} from 'react';
import {createServiceKey, type PluginStopParticipant} from '@/visloom/index.ts';
import type {RoleType} from './session.ts';

export interface WorkbenchMenuGroup {
    readonly key: string;
    readonly label: string;
    readonly order: number;
    readonly icon?: ReactNode;
}

export interface WorkbenchMenuEntry {
    readonly routeId: string;
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
    /** Attach menu entries to registered route IDs before UI mount. */
    registerMenuEntries(entries: readonly WorkbenchMenuEntry[]): PluginStopParticipant & {dispose(): void};
}

export const workbenchKey = createServiceKey<WorkbenchService>('app/workbench');
