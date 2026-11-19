/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import type {ConfigPanelProps} from '@datavisool/sdk/host';
import {Button, Dialog} from '@datavisool/ui';
import {Edit, Theme} from '@icon-park/react';
import type {IThemeItem} from '@datavisool/sdk/types';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import ThemeEditor from '@/comps/common-component/theme-config/theme-editor/ThemeEditor.tsx';
import ThemeList from '@/comps/common-component/theme-config/theme-list/ThemeList.tsx';
import {InspectorDomainContext} from '../InspectorDomainContext.ts';
import './ThemeConfig.less';

export default observer(function ThemeConfigImpl(props: ConfigPanelProps) {
    const context = useContext(InspectorDomainContext);
    const scene = useEditorScene();
    const controller = props.controller as ConfigPanelProps['controller'] & {isCurrent?: () => boolean};
    const [editTheme, setEditTheme] = useState(false);
    if (!context || !scene || !controller.isCurrent?.() || !context.domain.isActive()) return null;
    const themes = scene.themes;
    const themeChange = (theme: IThemeItem) => {
        if (!context.canEdit() || !controller.isCurrent?.() || !context.domain.isActive()) return;
        return context.domain.applyTheme(context.target.id, theme);
    };

    return (
        <>
            <div className="datavisool-theme-config">
                <div className="theme-config-header">
                    <div className="theme-config-toolbar">
                        <h3 className="theme-config-section-title"><Theme theme="outline" size={20} strokeWidth={1.75} fill="currentColor"/><span>主题预设</span></h3>
                        <Button type="default" size="sm" onClick={() => setEditTheme(true)} className="btn-create-theme" icon={<Edit theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}>自定义主题</Button>
                    </div>
                    <p className="theme-config-description">选择预设，应用当前组件的主色、背景和辅助色。</p>
                </div>
                <div className="theme-config-presets" role="group" aria-label="主题预设列表">
                    <ThemeList key={scene.version} data={themes.read()} onSelected={themeChange}/>
                </div>
                <p className="theme-config-tip">仅应用于当前组件。全局配色请使用顶部工具栏的主题入口。</p>
            </div>
            <Dialog title="编辑主题" open={editTheme} onClose={() => setEditTheme(false)} width={890} mask centered showClose className="datavisool-theme-editor-modal">
                <ThemeEditor key={scene.version} data={themes.read()} onChange={next => {
                    if (!context.canEdit() || !context.domain.isActive() || !controller.isCurrent?.()) return false;
                    return themes.replace(next);
                }}/>
            </Dialog>
        </>
    );
});
