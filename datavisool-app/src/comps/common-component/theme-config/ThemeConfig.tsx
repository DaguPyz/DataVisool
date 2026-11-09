/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Component} from 'react';
import './ThemeConfig.less';
import ThemeEditor from "./theme-editor/ThemeEditor";
import ThemeList from "./theme-list/ThemeList";
import rightStore from "@/designer/right/RightStore";
import {AbstractDesignerController} from "@datavisool/sdk/core";
import {Button, Dialog} from "@datavisool/ui";
import {IThemeItem} from "@datavisool/sdk/types";
import {Edit, Theme} from "@icon-park/react";

class ThemeConfig extends Component<{ controller: AbstractDesignerController }> {
    state = {
        editTheme: false,
    }

    openThemeEditor = () => this.setState({editTheme: true});

    closeEditor = () => this.setState({editTheme: false});

    themeChange = (theme: IThemeItem) => {
        if (!theme) return;
        const {activeElem: {id}} = rightStore;
        const {controllers} = window.DATAVISOOL_ENV.currentManager.layerManager;
        const instance = controllers[id + ''];
        instance && instance.updateTheme(theme);
    }

    render() {
        return (
            <>
                <div className="datavisool-theme-config">
                    <div className="theme-config-header">
                        <div className="theme-config-toolbar">
                            <h3 className="theme-config-section-title">
                                <Theme theme="outline" size={20} strokeWidth={1.75} fill="currentColor"/>
                                <span>主题预设</span>
                            </h3>
                            <Button
                                type="default"
                                size="sm"
                                onClick={this.openThemeEditor}
                                className="btn-create-theme"
                                icon={<Edit theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}
                            >
                                自定义主题
                            </Button>
                        </div>
                        <p className="theme-config-description">选择预设，应用当前组件的主色、背景和辅助色。</p>
                    </div>

                    <div className="theme-config-presets" role="group" aria-label="主题预设列表">
                        <ThemeList onSelected={this.themeChange}/>
                    </div>

                    <p className="theme-config-tip">仅应用于当前组件。全局配色请使用顶部工具栏的主题入口。</p>
                </div>
                <Dialog
                    title="编辑主题"
                    open={this.state.editTheme}
                    onClose={this.closeEditor}
                    width={890}
                    mask
                    centered
                    showClose
                    className="datavisool-theme-editor-modal"
                >
                    <ThemeEditor/>
                </Dialog>
            </>
        );
    }
}

export default ThemeConfig;
