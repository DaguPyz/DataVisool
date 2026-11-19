/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {ColorFilter, Ruler, Theme} from '@icon-park/react';
import {useEditorCommands} from '@/shared/designer/EditorCommandContext.ts';

const ProjectToolbarSettings = () => {
    const commands = useEditorCommands();
    const openDialog = (dialog:'canvas' | 'theme' | 'global-filter') => {
        void commands.execute('project.dialog', dialog, {toggle:true}).catch(error => {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
                console.error(`打开项目设置失败：${dialog}`, error);
        });
    };

    return <>
        <button type="button" className="workspace-icon-button" aria-label="画布设置" title="画布设置"
                onClick={() => openDialog('canvas')}><Ruler theme="outline" size={19}/></button>
        <button type="button" className="workspace-icon-button" aria-label="主题设置" title="主题设置"
                onClick={() => openDialog('theme')}><Theme theme="outline" size={19}/></button>
        <button type="button" className="workspace-icon-button" aria-label="全局滤镜" title="全局滤镜"
                onClick={() => openDialog('global-filter')}><ColorFilter theme="outline" size={19}/></button>
    </>;
};

export default ProjectToolbarSettings;
