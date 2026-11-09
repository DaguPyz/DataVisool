/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useMemo, useState} from 'react';
import {ConfigType} from '@/designer/right/ConfigContent.tsx';
import {FieldChangeData, DatavisoolGUI, type Control} from "@datavisool/ui";
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController.ts';
import '@/comps/maplibre-gis/map-base/MapLibreGisConfig.less';

/**
 * “地图基础”配置面板（map_base）
 *
 * 特点：
 * - 使用 DatavisoolGUI schema 来声明表单，统一走 onSchemaChange 回调
 * - 面板自身通过 forceRender 仅刷新面板 UI（不依赖组件重渲染）
 * - 配置变更通过 controller.update(dataFragment) 进入统一更新链路
 *
 * 特殊动作：
 * - refreshMap：强制重建 map（用于 styleUrl 变化、部分无法运行时更新的参数等）
 */
const MapLibreGisConfig: React.FC<ConfigType<MapLibreGisController>> = ({controller}) => {
    const style = controller.getConfig()?.style;
    const base = style?.base;

    const [, forceRender] = useState(0);

    /**
     * DatavisoolGUI 字段变更回调。
     * - dataFragment 是“局部补丁”，直接传给 controller.update 合并进总配置
     * - reRender 表示该字段变更是否需要刷新面板 UI（例如一些显示/隐藏、即时回显）
     */
    const onSchemaChange = (fieldChangeData: FieldChangeData) => {
        const {id, dataFragment, reRender} = fieldChangeData;
        if (id === 'refreshMap') {
            controller.refreshMap();
            forceRender(v => v + 1);
            return;
        }
        controller.update(dataFragment);
        if (reRender)
            forceRender(v => v + 1);
    };

    const baseSchema = useMemo<Control>(() => {
        return {
            key: 'style',
            type: 'grid',
            children: [
                {
                    type: 'card-panel',
                    label: '地图基础',
                    tip: '配置底图 Style、初始视角与交互。Style URL 通常指向 MapLibre/Mapbox Style JSON。',
                    children: [
                        {
                            type: 'grid',
                            key: 'base',
                            config: {gridGap: '10px'},
                            children: [
                                {
                                    key: 'styleUrl',
                                    label: '样式 URL',
                                    type: 'input',
                                    tip: '控制底图与基础样式（瓦片源、配色、文字等）。建议使用自建或明确授权的资源。',
                                    value: base?.styleUrl,
                                },
                                {
                                    key: 'previewDataInEditor',
                                    label: '编辑时预览数据',
                                    type: 'switch',
                                    tip: '开启后，编辑页面会触发数据源加载以便实时看到图层效果（WebSocket/MQTT 在编辑模式下默认不启用）。',
                                    value: base?.previewDataInEditor !== false,
                                },
                                {
                                    type: 'button',
                                    id: 'refreshMap',
                                    config: {children: '刷新地图'},
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }, [base?.previewDataInEditor, base?.styleUrl]);

    return (
        <div className={'mlgis-config'}>
            <DatavisoolGUI schema={baseSchema} onFieldChange={onSchemaChange}/>
        </div>
    );
};

export default MapLibreGisConfig;
