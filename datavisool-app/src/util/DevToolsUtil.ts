/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {loadTauriModule} from "@/util/TauriCompatUtil.ts";

export const openDevTools = () => {
    if (!('__TAURI_INTERNALS__' in window)) {
        return;
    }
    void loadTauriModule<{ invoke: (cmd: string) => Promise<unknown> }>('@tauri-apps/api/core')
        .then(({invoke}) => invoke('datavisool_open_devtools'))
        .catch((error) => {
            console.warn('open devtools failed', error);
        });
}
