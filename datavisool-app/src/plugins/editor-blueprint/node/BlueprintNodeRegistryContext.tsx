/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createContext, useContext, type ReactNode} from 'react';
import type {DesignerBlueprintNodeRegistry} from '@datavisool/sdk/plugin/contracts/editorBlueprint';

const BlueprintNodeRegistryContext = createContext<DesignerBlueprintNodeRegistry | null>(null);

export function BlueprintNodeRegistryProvider({registry, children}: {registry: DesignerBlueprintNodeRegistry; children: ReactNode}) {
    return <BlueprintNodeRegistryContext.Provider value={registry}>{children}</BlueprintNodeRegistryContext.Provider>;
}

export function useBlueprintNodeRegistry(): DesignerBlueprintNodeRegistry {
    const registry = useContext(BlueprintNodeRegistryContext);
    if (!registry)
        throw new Error('Blueprint node registry is unavailable outside the editor-blueprint overlay');
    return registry;
}
