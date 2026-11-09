/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useRef, useState} from 'react';
import './ThemeHdItem.less';
import ThemeList from "@/comps/common-component/theme-config/theme-list/ThemeList";
import ThemeEditor from "@/comps/common-component/theme-config/theme-editor/ThemeEditor";
import {Button, Dialog} from "@datavisool/ui";
import {IThemeItem} from "@datavisool/sdk/types";
import designerHeaderStore from "@/designer/header/DesignerHeaderStore.ts";
import {Attention, Check, Edit} from "@icon-park/react";
import ThemePreview from "./preview/ThemePreview.tsx";

const ThemeHdItemImpl = () => {
    const selectedThemeRef = useRef<IThemeItem>();
    const [previewTheme, setPreviewTheme] = useState<IThemeItem>();
    const [openEditor, setOpenEditor] = useState(false);

    const onClose = () => designerHeaderStore.setCurrentKey('');

    const updateGlobalTheme = () => {
        const {flashGlobalTheme} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (selectedThemeRef.current) {
            flashGlobalTheme(selectedThemeRef.current);
            onClose();
        }
    }

    return (
        <>
            <Dialog
                width="min(1040px, calc(100vw - 32px))"
                open={true}
                onClose={onClose}
                mask
                centered
                hideHeader
                showClose
                className="datavisool-theme-config-global-dialog"
                bodyClassName="datavisool-theme-config-global-body"
            >
                <div className="datavisool-theme-config-global">
                    <div className="theme-config-header">
                        <div className="theme-config-heading">
                            <h2>画布主题设置</h2>
                            <p>选择预设或自定义主题，统一当前项目组件的视觉风格。</p>
                        </div>
                    </div>

                    <div className="theme-config-panel">
                        <div className="theme-config-presets">
                            <h3 className="theme-config-section-title">主题预设</h3>
                            <div className="datavisool-theme-list-container">
                                <ThemeList onSelected={(value) => {
                                    selectedThemeRef.current = value;
                                    setPreviewTheme(value);
                                }}/>
                            </div>
                        </div>
                        <ThemePreview theme={previewTheme ?? window.DATAVISOOL_ENV.currentManager.themeManager?.themeConfig?.[0]}/>
                    </div>

                    <div className="datavisool-theme-config-footer">
                        <div className="datavisool-theme-warning">
                            <Attention theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>
                            <span>更新后将影响当前项目的所有组件</span>
                        </div>
                        <div className="theme-config-actions">
                            <Button type="default" onClick={onClose} className="btn-cancel">取消</Button>
                            <Button
                                type="default"
                                onClick={() => setOpenEditor(true)}
                                className="btn-custom"
                                icon={<Edit theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}
                            >
                                自定义主题
                            </Button>
                            <Button
                                type="primary"
                                onClick={updateGlobalTheme}
                                className="btn-update"
                                icon={<Check theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}
                            >
                                更新全局主题
                            </Button>
                        </div>
                    </div>
                </div>
            </Dialog>
            <Dialog
                title="编辑主题"
                open={openEditor}
                onClose={() => setOpenEditor(false)}
                width={890}
                centered={true}
                mask
                showClose
                className="datavisool-theme-editor-modal"
            >
                <ThemeEditor/>
            </Dialog>
        </>
    );
}

export default ThemeHdItemImpl;
