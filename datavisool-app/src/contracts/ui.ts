/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ReactNode} from 'react';

export interface RootProvidersProps {
    readonly renderContent: () => ReactNode;
}

export interface UiService {
    /** Attach the root view after all startup plugins have activated. */
    mount(container: HTMLElement): void;
}

declare module '../visloom/contracts/index.ts' {
    interface PluginServices {
        ui: UiService;
    }
}
