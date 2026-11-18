/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ComponentType} from 'react';

export interface DynamicScriptListProps {
    readonly projectId?: string;
    readonly title?: string;
    readonly variant?: 'resource';
}

export interface DynamicScriptsService {
    /** Render the script manager for a project or for the workbench resource library. */
    readonly ScriptList: ComponentType<DynamicScriptListProps>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        dynamicScripts: DynamicScriptsService;
    }
}
