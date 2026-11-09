/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useEffect, useState} from "react";
import type {BPRightConfigProps} from "@/designer/blueprint/right/BPRight";
import type {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import {Switch} from "@datavisool/ui";

const BPNodeCommonConfig: React.FC<BPRightConfigProps<AbstractBPNodeController<any>>> = ({controller}) => {
    const config = controller?.getConfig();
    const [enabled, setEnabled] = useState(config?.enabled ?? true);

    useEffect(() => {
        setEnabled(config?.enabled ?? true);
    }, [config?.id, config?.enabled]);

    return (
        <div className={'bp-node-common-config'}>
            <div className="bp-config-field">
                <span className="bp-config-label">启用</span>
                <Switch value={enabled}
                        switchSize="sm"
                        onChange={(nextEnabled) => {
                            setEnabled(nextEnabled);
                            controller?.update({enabled: nextEnabled});
                        }}/>
            </div>
        </div>
    );
};

export default BPNodeCommonConfig;
