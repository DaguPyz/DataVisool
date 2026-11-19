/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BPInteractionEngine} from "@/plugins/editor-blueprint/drag/BPInteractionEngine";
import {observer} from "mobx-react";
import {BPNodeContainer} from "./BPNodeContainer.tsx";
import {useEffect, useRef} from "react";
import {useEditorBlueprintSession} from '../session/EditorBlueprintSessionContext.tsx';

const NodeLayer = observer(() => {
    const manager = useEditorBlueprintSession();
    const currentPageManager = manager?.currentPageManager;
    const _npNodeConRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = _npNodeConRef.current;
        if (!manager || !currentPageManager || !container)
            return;
        manager.setNodeContainerRef(container);
        return () => {
            if (manager.nodeContainerRef === container)
                manager.nodeContainerRef = null;
        };
    }, [manager, currentPageManager]);

    if (!currentPageManager)
        return null;
    const {bpNodeLayoutMap} = currentPageManager;

    return (
        <div id={'bp-node-container'} style={{position: 'relative', width: 0, height: 0}}
             ref={_npNodeConRef}>
            <div id="bp-node-content" style={{width: 0, height: 0}}>
                <BPInteractionEngine>
                    {Object.values(bpNodeLayoutMap).map((layout) => {
                        return <BPNodeContainer key={layout.id} layout={layout}/>
                    })}
                </BPInteractionEngine>
            </div>
        </div>
    )
})

export default NodeLayer;
