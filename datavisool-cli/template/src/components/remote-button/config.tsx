/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {Controller} from "./controller";

export const BaseButtonStyleConfig: React.FC<{ controller: Controller }> = ({controller}) => {

    const {style} = controller.getConfig()!;

    const updateStyle = (key: string, value: string | number) => {
        controller.update({
            style: {
                [key]: value,
            },
        } as any);
    }

    return (
        <div style={{display: 'grid', gap: 10, padding: 10}}>
            <label>内容
                <input value={style?.content ?? ''} onChange={(event) => updateStyle('content', event.target.value)}/>
            </label>
            <label>字号
                <input type="number" min={1} value={style?.fontSize ?? 16}
                       onChange={(event) => updateStyle('fontSize', Number(event.target.value))}/>
            </label>
            <label>字重
                <input type="number" min={100} max={900} step={100} value={style?.fontWeight ?? 400}
                       onChange={(event) => updateStyle('fontWeight', Number(event.target.value))}/>
            </label>
            <label>文字颜色
                <input type="color" value={style?.color ?? '#ffffff'}
                       onChange={(event) => updateStyle('color', event.target.value)}/>
            </label>
            <label>背景颜色
                <input type="color" value={style?.backgroundColor ?? '#3d6aff'}
                       onChange={(event) => updateStyle('backgroundColor', event.target.value)}/>
            </label>
            <label>边框圆角
                <input type="number" min={0} value={style?.borderRadius ?? 0}
                       onChange={(event) => updateStyle('borderRadius', Number(event.target.value))}/>
            </label>
            <label>边框宽度
                <input type="number" min={0} value={style?.borderWidth ?? 0}
                       onChange={(event) => updateStyle('borderWidth', Number(event.target.value))}/>
            </label>
            <label>边框颜色
                <input type="color" value={style?.borderColor ?? '#668cff'}
                       onChange={(event) => updateStyle('borderColor', event.target.value)}/>
            </label>
        </div>
    )
}
