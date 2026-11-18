/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {PluginStopParticipant} from '../../plugin.js';

export interface WorkbenchAccountEntry {
    readonly routeId: string;
    readonly label: string;
}

export interface WorkbenchService {
    /** Register entries in the account dropdown before UI mount. */
    registerAccountEntries(entries: readonly WorkbenchAccountEntry[]): PluginStopParticipant & {dispose(): void};
}

declare module '../../plugin.js' {
    interface PluginServices {
        workbench: WorkbenchService;
    }
}
