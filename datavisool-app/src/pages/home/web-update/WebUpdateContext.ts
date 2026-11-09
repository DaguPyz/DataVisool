/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createContext, useContext} from "react";

interface WebUpdateContextValue {
    checking: boolean;
    canCheckForUpdates: boolean;
    checkForUpdates: () => Promise<void>;
}

export const WebUpdateContext = createContext<WebUpdateContextValue | null>(null);

export function useWebUpdate() {
    const context = useContext(WebUpdateContext);
    if (!context) {
        throw new Error("useWebUpdate must be used inside WebUpdateNotice");
    }
    return context;
}
