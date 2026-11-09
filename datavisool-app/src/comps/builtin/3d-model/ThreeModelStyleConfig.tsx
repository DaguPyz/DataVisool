/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, { useState, useEffect } from "react";
import { ConfigType } from "../../../designer/right/ConfigContent";
import { ThreeModelController } from "./ThreeModelController";
import { Dialog, FieldChangeData, DatavisoolGUI } from "@datavisool/ui";
import { Control } from "@datavisool/ui";
import { Cube } from "@icon-park/react";
import threeDModelResourceStore from "../../../pages/home/model-resource/ThreeDModelResourceStore";
import { observer } from "mobx-react";
import './ThreeModelStyleConfig.less';

// 模型选择器弹窗内容组件
const ModelSelectorContent = observer(({ onSelect }: { onSelect: (url: string, format: string) => void }) => {
    useEffect(() => {
        threeDModelResourceStore.getList({ size: 100 }); // 获取前100个模型
    }, []);

    const { records } = threeDModelResourceStore.pageData;

    const handleSelect = (item: any) => {
        let format = 'glb';
        if (item.name?.endsWith('.fbx')) format = 'fbx';
        else if (item.name?.endsWith('.obj')) format = 'obj';
        else if (item.name?.endsWith('.gltf')) format = 'gltf';

        onSelect(item.url, format);
    };

    const formatSize = (size: number) => {
        if (!size) return 'Unknown';
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
        return (size / 1024 / 1024).toFixed(1) + ' MB';
    };

    return (
        <div className="model-list-container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                {records.map((item: any) => {
                    const ext = item.name?.split('.').pop()?.toUpperCase() || 'UNKNOWN';
                    // 根据文件类型选择图标颜色 (保持与主色调协调)
                    let iconColor = '#1d8cf8'; // Info Blue
                    if (ext === 'GLB' || ext === 'GLTF') iconColor = '#00f2c3'; // Success Teal
                    else if (ext === 'FBX') iconColor = '#fd5d93'; // Primary Pink
                    else if (ext === 'OBJ') iconColor = '#e14eca'; // Warning Purple

                    return (
                        <div key={item.id} className="model-item-card" onClick={() => handleSelect(item)}>
                            <div className="model-icon-wrapper">
                                <div className="model-tag" style={{ backgroundColor: iconColor }}>{ext}</div>
                                <Cube theme="filled" size="48" fill={iconColor} className="icon-park-icon" />
                            </div>
                            <div className="model-info">
                                <div className="model-name" title={item.name}>{item.name}</div>
                                <div className="model-size">{formatSize(item.size)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

const ThreeModelStyleConfig: React.FC<ConfigType<ThreeModelController>> = ({ controller }) => {
    const { style } = controller.getConfig()!;
    const [, setCount] = useState(0);
    const [modalVisible, setModalVisible] = useState(false);

    const onFieldChange = (fieldChangeData: FieldChangeData) => {
        const { id, dataFragment, reRender } = fieldChangeData;

        if (id === 'selectModelFromLib') {
            setModalVisible(true);
            return;
        }

        const fragment = dataFragment as any;

        // 处理相机位置数组更新
        if (fragment?.style?.camera?.position) {
            const posFragment = fragment.style.camera.position;
            // 如果 position 是对象（如 {0: val, 1: val}），则转换为数组
            if (!Array.isArray(posFragment)) {
                const currentPos = style?.camera?.position || [0, 0, 10];
                fragment.style.camera.position = [
                    posFragment[0] ?? currentPos[0],
                    posFragment[1] ?? currentPos[1],
                    posFragment[2] ?? currentPos[2]
                ];
            }
        }
        // 处理相机目标点数组更新
        if (fragment?.style?.camera?.target) {
            const targetFragment = fragment.style.camera.target;
            if (!Array.isArray(targetFragment)) {
                const currentTarget = style?.camera?.target || [0, 0, 0];
                fragment.style.camera.target = [
                    targetFragment[0] ?? currentTarget[0],
                    targetFragment[1] ?? currentTarget[1],
                    targetFragment[2] ?? currentTarget[2]
                ];
            }
        }
        console.log(fragment)
        controller.update(fragment);
        if (reRender)
            setCount(count => count + 1);
    }

    const handleModelSelect = (url: string, format: string) => {
        controller.update({
            style: {
                source: {
                    url: url,
                    format: format as any
                }
            }
        });
        setModalVisible(false);
        setCount(count => count + 1);
    };

    const schema: Control = {
        key: 'style',
        type: 'grid',
        children: [
            {
                type: 'accordion',
                label: '模型源',
                children: [
                    {
                        key: 'source',
                        type: 'grid',
                        children: [
                            {
                                id: 'selectModelFromLib',
                                type: 'button',
                                config: {
                                    children: '从资源库选择',
                                    type: 'primary',
                                }
                            },
                            {
                                key: 'url',
                                type: 'input',
                                label: 'URL',
                                value: style?.source?.url,
                            },
                            {
                                key: 'format',
                                type: 'select',
                                label: '格式',
                                value: style?.source?.format,
                                config: {
                                    options: [
                                        { label: 'GLB', value: 'glb' },
                                        { label: 'GLTF', value: 'gltf' },
                                        { label: 'FBX', value: 'fbx' },
                                        { label: 'OBJ', value: 'obj' },
                                    ]
                                }
                            }
                        ]
                    },
                ]
            },
            {
                type: 'accordion',
                key: 'scene',
                label: '场景环境',
                children: [
                    {
                        type: 'grid',
                        config: {
                            containerStyle: { marginTop: 10 }
                        },
                        children: [
                            {
                                key: 'background.type',
                                type: 'select',
                                label: '背景类型',
                                value: style?.scene?.background?.type,
                                reRender: true,
                                config: {
                                    options: [
                                        { label: '纯色', value: 'color' },
                                        { label: '天空盒', value: 'sky' },
                                        { label: '环境', value: 'environment' },
                                        { label: '透明', value: 'transparent' },
                                    ]
                                }
                            },
                            {
                                key: 'background.value',
                                type: 'color-picker',
                                label: '背景色',
                                value: style?.scene?.background?.value,
                                rules: "{background.type} === 'color'",
                            },
                            {
                                key: 'environment.preset',
                                type: 'select',
                                label: '环境预设',
                                value: style?.scene?.environment?.preset,
                                config: {
                                    options: [
                                        { label: '城市 (City)', value: 'city' },
                                        { label: '公园 (Park)', value: 'park' },
                                        { label: '大堂 (Lobby)', value: 'lobby' },
                                        { label: '摄影棚 (Studio)', value: 'studio' },
                                        { label: '夜晚 (Night)', value: 'night' },
                                        { label: '森林 (Forest)', value: 'forest' },
                                        { label: '日落 (Sunset)', value: 'sunset' },
                                    ]
                                }
                            },
                            {
                                key: 'environment.blur',
                                type: 'number-input',
                                label: '环境模糊',
                                value: style?.scene?.environment?.blur,
                                config: {
                                    min: 0,
                                    max: 1,
                                    step: 0.1
                                }
                            }
                        ]
                    },
                ]
            },
            {
                type: 'accordion',
                key: 'lights',
                label: '灯光',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                key: 'ambient.intensity',
                                type: 'number-input',
                                label: '环境光强',
                                value: style?.lights?.ambient?.intensity,
                                config: {
                                    min: 0,
                                    max: 5,
                                    step: 0.1
                                }
                            },
                            {
                                key: 'directional.intensity',
                                type: 'number-input',
                                label: '主光强度',
                                value: style?.lights?.directional?.intensity,
                                config: {
                                    min: 0,
                                    max: 10,
                                    step: 0.1
                                }
                            },
                        ]
                    },
                ]
            },
            {
                type: 'accordion',
                key: 'camera',
                label: '相机与控制',
                children: [
                    {
                        key: 'controls',
                        type: 'grid',
                        config: {
                            containerStyle: {
                                marginBottom: 10
                            }
                        },
                        children: [
                            {
                                key: 'interactive',
                                type: 'switch',
                                label: '允许交互',
                                value: style?.camera?.controls?.interactive,
                            },
                            {
                                key: 'autoRotate',
                                type: 'switch',
                                label: '自动旋转',
                                value: style?.camera?.controls?.autoRotate,
                            },
                            {
                                key: 'autoRotateSpeed',
                                type: 'number-input',
                                label: '旋转速度',
                                value: style?.camera?.controls?.autoRotateSpeed,
                                config: {
                                    min: 0,
                                    max: 20,
                                    step: 0.1
                                }
                            }
                        ]
                    },
                    {
                        key: 'position',
                        type: 'grid',
                        label: '初始位置',
                        children: [
                            {
                                key: '0',
                                type: 'number-input',
                                label: 'X',
                                value: style?.camera?.position?.[0],
                                config: { step: 0.1 }
                            },
                            {
                                key: '1',
                                type: 'number-input',
                                label: 'Y',
                                value: style?.camera?.position?.[1],
                                config: { step: 0.1 }
                            },
                            {
                                key: '2',
                                type: 'number-input',
                                label: 'Z',
                                value: style?.camera?.position?.[2],
                                config: { step: 0.1 }
                            }
                        ]
                    },
                    {
                        key: 'fov',
                        type: 'grid',
                          config: {
                            containerStyle: {
                                marginTop: 10
                            }
                        },
                        children: [
                            {
                                type: 'number-input',
                                label: '视场角',
                                value: style?.camera?.fov,
                                config: {
                                    min: 10,
                                    max: 100,
                                    step: 1
                                }
                            }
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                key: 'display',
                label: '显示设置',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                key: 'mode',
                                type: 'select',
                                label: '模式',
                                value: style?.display?.mode,
                                config: {
                                    options: [
                                        { label: '标准', value: 'standard' },
                                        { label: '线框', value: 'wireframe' },
                                        { label: '白模', value: 'clay' },
                                    ]
                                }
                            },
                            {
                                key: 'autoCenter',
                                type: 'switch',
                                label: '自动居中',
                                value: style?.display?.autoCenter,
                            },
                            {
                                key: 'scale',
                                type: 'number-input',
                                label: '缩放',
                                value: style?.display?.scale,
                                config: {
                                    min: 0.01,
                                    step: 0.1
                                }
                            }
                        ]
                    }
                ]
            },
            {
                type: 'accordion',
                key: 'animation',
                label: '动画设置',
                children: [
                    {
                        type: 'grid',
                        children: [
                            {
                                key: 'enabled',
                                type: 'switch',
                                label: '播放动画',
                                value: style?.animation?.enabled,
                            },
                            {
                                key: 'speed',
                                type: 'number-input',
                                label: '播放速度',
                                value: style?.animation?.speed,
                                rules: "{enabled} === true",
                                config: {
                                    min: 0,
                                    max: 10,
                                    step: 0.1,
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    }

    return (
        <div style={{ padding: 10 }}>
            <DatavisoolGUI schema={schema} onFieldChange={onFieldChange} />
            <Dialog
                title="选择模型"
                open={modalVisible}
                onClose={() => setModalVisible(false)}
                width={800}
                className="model-selector-modal"
                mask
                centered
                showClose
            >
                <ModelSelectorContent onSelect={handleModelSelect} />
            </Dialog>
        </div>
    )
}

export default ThreeModelStyleConfig;
