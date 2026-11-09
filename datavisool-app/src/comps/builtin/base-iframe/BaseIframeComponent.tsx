/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";

export interface BaseIframeComponentStyle {
    src?: string;
}

export interface BaseIframeComponentProps extends ComponentBaseProps {
    style?: BaseIframeComponentStyle;
}

class BaseIframeComponent extends Component<BaseIframeComponentProps, BaseIframeComponentProps & { visible: boolean }> {

    constructor(props: BaseIframeComponentProps) {
        super(props);
        this.state = {...props, visible: true};
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    eventHandlerMap: Record<string, Function> = {};

    onLoad = () => {
        if ('load' in this.eventHandlerMap)
            this.eventHandlerMap['load']();
    }

    changeVisible = (visible: boolean) => {
        this.setState({visible});
    }

    render() {
        if (!this.state.visible)
            return null;
        const {src} = this.state.style!;
        return (
            <>
                {src === "" ? <div style={{
                    color: '#9a9a9a',
                    height: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <div>请设置iframe地址</div>
                </div> : <div style={{height: '100%', display: 'flex'}}>
                    <iframe title={'DataVisool 标准 iframe 组件'} src={src} onLoad={this.onLoad}
                            style={{width: '100%', height: '100%', border: 'none'}}/>
                </div>}
            </>
        );
    }
}

export default BaseIframeComponent;
