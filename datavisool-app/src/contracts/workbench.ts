/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createServiceKey, type PluginStopParticipant} from '@/visloom/index.ts';

export interface WorkbenchAccountEntry {
    readonly routeId: string;
    readonly label: string;
}

export interface WorkbenchService {
    /** Register entries in the account dropdown before UI mount. */
    registerAccountEntries(entries: readonly WorkbenchAccountEntry[]): PluginStopParticipant & {dispose(): void};
}

export const workbenchKey = createServiceKey<WorkbenchService>('app/workbench');
