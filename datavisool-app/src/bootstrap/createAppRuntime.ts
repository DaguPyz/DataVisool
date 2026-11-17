/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Visloom, type Plugin} from '../visloom/index.ts';

export async function createAppRuntime(plugins: readonly Plugin[]): Promise<Visloom> {
    const runtime = new Visloom();
    await runtime.start(plugins);
    return runtime;
}
