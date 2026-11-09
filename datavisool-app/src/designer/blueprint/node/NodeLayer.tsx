/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BPInteractionEngine} from "@/designer/blueprint/drag/BPInteractionEngine";
import {observer} from "mobx-react";
import {BPNodeContainer} from "@/designer/blueprint/node/core/node-container/BPNodeContainer";
import {useEffect, useRef} from "react";

const NodeLayer = observer(() => {
    const currentPageManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager.currentPageManager;
    if (!currentPageManager)
        return null;
    const {bpNodeLayoutMap} = currentPageManager;
    const _npNodeConRef = useRef(null);

    useEffect(() => {
        const {setNodeContainerRef} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        setNodeContainerRef(_npNodeConRef.current!);
    }, []);

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
