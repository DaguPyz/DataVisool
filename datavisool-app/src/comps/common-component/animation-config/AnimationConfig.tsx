/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import './AnimationConfig.less';
import {AbstractDesignerController} from "@datavisool/sdk/core";

class AnimationConfig extends Component<{ controller: AbstractDesignerController }> {
    render() {
        return (
            <div className={'datavisool-animation-config'}>
                动画设置
            </div>
        );
    }
}

export default AnimationConfig;