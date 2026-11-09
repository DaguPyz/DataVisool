/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import {ComponentBaseProps} from "@datavisool/sdk/types";

export interface IImageData {
    /**
     * 图片id，在线项目为数据库中的id值，本地项目为图片的hash值
     */
    id?: string;
    /**
     * 图片文件的hash码，用于判断图片是否重复，节省内存和磁盘空间
     */
    hash?: string;
    /**
     * 图片名称，默认取文件名
     */
    name?: string;
    /**
     * 图片文件源数据，用于本地项目中做图片与可访问资源链接的转换
     */
    blob?: Blob;
    /**
     * 图片url地址，在线项目取图片的可访问资源链接。本地项目中通过blob和URL.createObjectURL(blob)生成
     */
    url: string;
}

export interface BaseImageComponentStyle {
    type?: 'online' | 'local';
    onLineUrl?: string;
    localUrl?: string;
    hash?: string;
    opacity?: number;
}

export interface BaseImageComponentProps extends ComponentBaseProps {
    style?: BaseImageComponentStyle;
}

const resolveSourceValue = (value: unknown, depth = 0): string => {
    if (depth > 2 || value == null)
        return '';
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed;
    }
    if (typeof value === 'object') {
        const record = value as Record<string, any>;
        const type = record.type;
        if (type === 'online') {
            const onlineUrl = resolveSourceValue(record.onLineUrl, depth + 1);
            if (onlineUrl)
                return onlineUrl;
        }
        if (type === 'local') {
            const localUrl = resolveSourceValue(record.localUrl, depth + 1);
            if (localUrl)
                return localUrl;
        }
        const preferredKeys = ['url', 'src', 'data', 'onLineUrl', 'localUrl', 'value'];
        for (const key of preferredKeys) {
            const resolved = resolveSourceValue(record[key], depth + 1);
            if (resolved)
                return resolved;
        }
    }
    return '';
};

const resolveImageSource = (config: BaseImageComponentProps) => {
    const dataSource = resolveSourceValue(config.data?.value);
    if (dataSource)
        return dataSource;
    const style = config.style ?? (config as any);
    if (!style)
        return '';
    const styleSource = style.type === 'online'
        ? style.onLineUrl
        : style.type === 'local'
            ? style.localUrl
            : style.onLineUrl || style.localUrl;
    return resolveSourceValue(styleSource);
};

class BaseImageComponent extends Component<BaseImageComponentProps, BaseImageComponentProps & { visible: boolean }> {

    constructor(props: BaseImageComponentProps) {
        super(props);
        this.state = {...props, visible: true}
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    eventHandlerMap: Record<string, Function> = {};

    onClick = () => {
        if ('click' in this.eventHandlerMap)
            this.eventHandlerMap['click']();
    }

    changeVisible = (visible: boolean) => {
        this.setState({visible});
    }

    render() {
        if (!this.state.visible)
            return null;
        const {style} = this.state;
        const src = resolveImageSource(this.state);
        return (
            <div style={{width: '100%', height: '100%'}} onClick={this.onClick}>
                {!src ? <div style={{
                        color: '#9a9a9a',
                        height: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        <div>请配置图片链接、上传图片或绑定数据源</div>
                    </div> :
                    <img alt={'图片组件'} style={{opacity: style?.opacity}} width={'100%'} height={'100%'} src={src}/>}
            </div>
        );
    }
}

export default BaseImageComponent;
