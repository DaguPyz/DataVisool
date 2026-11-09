/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {observer} from "mobx-react";
import {MouseEvent, ReactNode, useRef, useState} from 'react';
import './CanvasHdConfigImpl.less';
import {AdaptationType, ICanvasManager} from "@datavisool/sdk/types";
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";
import {Button, Dialog, NumberInput, Select, Switch} from "@datavisool/ui";
import {Check, Info, Ruler} from "@icon-park/react";

const adaptationOptions: { label: string; value: AdaptationType }[] = [
    {label: '自适应 (Scale)', value: 'scale'},
    {label: '撑满宽度 (Full Width)', value: 'full-x'},
    {label: '撑满高度 (Full Height)', value: 'full-y'},
    {label: '撑满全屏 (Full Screen)', value: 'full-screen'},
    {label: '无自适应 (None)', value: 'none'},
];

const normalizeNumber = (value: number | undefined) => value || 0;

const CanvasField = (props: { label: string; desc?: string; children: ReactNode; className?: string }) => {
    const {label, desc, children, className = ''} = props;

    return (
        <div className={`canvas-config-field ${className}`}>
            <label>
                <span>{label}</span>
                {desc ? <small>{desc}</small> : null}
            </label>
            {children}
        </div>
    );
};

const CanvasHdConfigImpl = observer(() => {
    const {canvasManager} = window.DATAVISOOL_ENV.currentManager;
    const [draftConfig, setDraftConfig] = useState<ICanvasManager>(() => ({...canvasManager!.canvasConfig}));
    const configRef = useRef<ICanvasManager>({...canvasManager!.canvasConfig});
    const {width, height, rasterize, dragStep, resizeStep, adaptationType, boxSelectionMode = 'intersect'} = draftConfig;

    const updateConfig = <K extends keyof ICanvasManager>(key: K, value: ICanvasManager[K]) => {
        const nextConfig = {...configRef.current, [key]: value};
        configRef.current = nextConfig;
        setDraftConfig(nextConfig);
    };

    const onClose = () => {
        designerHeaderStore.setCurrentKey('')
    }

    const doSave = (e: MouseEvent<HTMLButtonElement>) => {
        window.DATAVISOOL_ENV.currentManager.canvasManager!.updateCanvasConfig(configRef.current);
        e.preventDefault();
        onClose();
    }

    return (
        <Dialog
            className="datavisool-header-canvas-config-dialog"
            bodyClassName="datavisool-header-canvas-config-body"
            width="min(760px, calc(100vw - 48px))"
            open={true}
            onClose={onClose}
            mask
            centered
            hideHeader
            showClose
        >
            <div className="datavisool-header-canvas-config">
                <div className="canvas-config-header">
                    <div className="canvas-config-heading">
                        <h2>画布设置</h2>
                        <p>配置画布尺寸、屏幕适配与栅格吸附策略。</p>
                    </div>
                </div>

                <div className="canvas-config-panel">
                    <div className="canvas-config-section-title">
                        <Ruler theme="outline" size={18} strokeWidth={4} fill="currentColor"/>
                        <span>基础尺寸</span>
                    </div>

                    <div className="canvas-config-grid">
                        <CanvasField label="宽度" desc="Width / px">
                            <NumberInput
                                value={width}
                                min={1}
                                onChange={(value) => {
                                    if (value !== undefined && Number.isFinite(value) && value > 0)
                                        updateConfig('width', value);
                                }}
                                controlClassName="canvas-config-number"
                            />
                        </CanvasField>

                        <CanvasField label="高度" desc="Height / px">
                            <NumberInput
                                value={height}
                                min={1}
                                onChange={(value) => {
                                    if (value !== undefined && Number.isFinite(value) && value > 0)
                                        updateConfig('height', value);
                                }}
                                controlClassName="canvas-config-number"
                            />
                        </CanvasField>
                    </div>

                    <CanvasField label="屏幕适配" desc="Adaptation">
                        <Select
                            value={adaptationType}
                            onChange={(value) => updateConfig('adaptationType', value as AdaptationType)}
                            options={adaptationOptions}
                            block
                            controlClassName="canvas-config-select"
                            panelClassName="canvas-config-select-panel"
                        />
                    </CanvasField>

                    <div className="canvas-config-toggle-grid">
                        <div className={`canvas-config-toggle-card ${boxSelectionMode === 'contain' ? 'enabled' : ''}`}>
                            <div className="canvas-config-toggle-copy">
                                <span className="canvas-config-toggle-icon">
                                    <Info theme="outline" size={20} strokeWidth={4} fill="currentColor"/>
                                </span>
                                <div>
                                    <strong>完整框选 (Contain)</strong>
                                    <p>开启后，框选区域必须完整包住元素才会选中。</p>
                                </div>
                            </div>
                            <Switch
                                value={boxSelectionMode === 'contain'}
                                onChange={(checked) => updateConfig('boxSelectionMode', checked ? 'contain' : 'intersect')}
                                controlClassName="canvas-config-switch"
                            />
                        </div>

                        <div className={`canvas-config-toggle-card ${rasterize ? 'enabled' : ''}`}>
                            <div className="canvas-config-toggle-copy">
                                <span className="canvas-config-toggle-icon">
                                    <Info theme="outline" size={20} strokeWidth={4} fill="currentColor"/>
                                </span>
                                <div>
                                    <strong>栅格化 (Rasterize)</strong>
                                    <p>开启后，拖拽与缩放操作将按照设置步长吸附。</p>
                                </div>
                            </div>
                            <Switch
                                value={!!rasterize}
                                onChange={(checked) => updateConfig('rasterize', checked)}
                                controlClassName="canvas-config-switch"
                            />
                        </div>
                    </div>

                    {rasterize ? (
                        <div className="canvas-config-grid canvas-config-step-grid">
                            <CanvasField label="拖拽步长" desc="Drag step">
                                <NumberInput
                                    value={dragStep}
                                    onChange={(value) => updateConfig('dragStep', normalizeNumber(value))}
                                    controlClassName="canvas-config-number"
                                />
                            </CanvasField>

                            <CanvasField label="缩放步长" desc="Resize step">
                                <NumberInput
                                    value={resizeStep}
                                    onChange={(value) => updateConfig('resizeStep', normalizeNumber(value))}
                                    controlClassName="canvas-config-number"
                                />
                            </CanvasField>
                        </div>
                    ) : null}

                    <div className="canvas-config-desc">
                        说明：修改画布设置会影响整体布局，建议在大屏设计初期完成配置。
                    </div>
                </div>

                <div className="canvas-config-footer">
                    <Button type="default" onClick={onClose} className="btn-cancel">
                        取消
                    </Button>
                    <Button type="primary" onClick={doSave} className="btn-save" icon={<Check theme="outline" size={16} strokeWidth={4.5} fill="currentColor"/>}>
                        确定
                    </Button>
                </div>
            </div>
        </Dialog>
    );
})

export default CanvasHdConfigImpl;
