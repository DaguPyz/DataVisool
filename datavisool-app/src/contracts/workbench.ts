/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {PluginStopParticipant} from '../visloom/contracts/index.ts';

export interface WorkbenchAccountEntry {
    readonly routeId: string;
    readonly label: string;
}

export interface WorkbenchService {
    /** Register entries in the account dropdown before UI mount. */
    registerAccountEntries(entries: readonly WorkbenchAccountEntry[]): PluginStopParticipant & {dispose(): void};
}

declare module '../visloom/contracts/index.ts' {
    interface PluginServices {
        workbench: WorkbenchService;
    }
}
