/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {Plugin} from '@datavisool/sdk/plugin';
import {Visloom} from '@/visloom';

export async function createAppRuntime(plugins: readonly Plugin[]): Promise<Visloom> {
    const runtime = new Visloom();
    await runtime.start(plugins);
    return runtime;
}
