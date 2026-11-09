/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import '../DemoMain.less'
import {Control} from '@datavisool/ui';
import {FieldChangeData, DatavisoolGUI} from '@datavisool/ui';
import {ColorMode, ImageUpload, CheckBox} from '@datavisool/ui';


class JsonSchemaDemo extends Component {

    schema: Control = {
        key: "style",
        children: [
            {
                key: "xAxis",
                type: "accordion",
                children: [
                    {
                        key: "grid",
                        label: "网格线",
                        type: "grid",
                        config: {
                            columns: 4
                        },
                        children: [
                            {
                                label: "开启",
                                type: "switch",
                                value: true,
                            },
                            {
                                key: "alignTick",
                                label: "对齐",
                                type: "switch",
                                value: true
                            },
                            {
                                key: "line",
                                children: [
                                    {
                                        key: "style",
                                        children: [
                                            {
                                                key: "lineWidth",
                                                label: "线宽",
                                                type: "input",
                                                value: 1
                                            },
                                            {
                                                key: "stroke",
                                                label: "颜色",
                                                type: "color-picker",
                                                value: "#878787ff",
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        key: "label",
                        // label: "标签",
                        type: "grid",
                        config: {
                            columns: 4
                        },
                        children: [
                            {
                                key: "style",
                                children: [
                                    {
                                        key: "fill",
                                        label: "颜色",
                                        type: "color-picker",
                                        value: "#878787ff"
                                    },
                                    {
                                        key: "fontSize",
                                        label: "字号",
                                        type: "input",
                                        value: 10,
                                    }
                                ]
                            }
                        ]
                    }
                ],
            }
        ]
    }

    onChange = (fieldChangeData: FieldChangeData) => {
        console.log('fieldChangeData', fieldChangeData);
    }

    render() {
        return (
            <div style={{width: 400, height: 800, background: "#333333", padding: 10}}>
                <DatavisoolGUI schema={this.schema} onFieldChange={this.onChange}/>
                <ImageUpload label={'上传'} tip={'测试上传'}/>
                <ColorMode label={'演示模式'} tip={'嘿嘿'} defaultValue={['#fff']}
                           onChange={(value => console.log('颜色模式', value))}/>
                <CheckBox label={'测试checkbox'} defaultValue={true}/>
            </div>
        );
    }
}

export default JsonSchemaDemo;