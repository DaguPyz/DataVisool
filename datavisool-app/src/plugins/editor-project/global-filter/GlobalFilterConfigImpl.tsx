/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {observer} from 'mobx-react';
import './GlobalFilterConfigImpl.less';
import {IFilterConfigType} from '@datavisool/sdk/types';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {Button, Dialog} from '@datavisool/ui';
import {Check} from '@icon-park/react';
import globalFilterVisual from './assets/global-filter-visual.webp';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import FilterControls from '@/comps/common-component/filter-config/FilterControls.tsx';

const defaultGlobalFilterConfig: Required<IFilterConfigType> = {
    enable: false,
    blur: 0,
    brightness: 1,
    contrast: 1,
    opacity: 1,
    saturate: 1,
    hueRotate: 0,
};

const GlobalFilterConfigImpl = observer(({onClose, canEdit}: {onClose(): void; canEdit(): boolean}) => {
    const scene = useEditorScene();
    if (!scene) return null;
    return <GlobalFilterDialog key={scene.version} scene={scene} onClose={onClose} canEdit={canEdit}/>;
});

const GlobalFilterDialog = observer(({scene, onClose, canEdit}: {scene: Pick<DesignerEditingScene, 'version' | 'readFilterConfig' | 'updateFilterConfig'>; onClose(): void; canEdit(): boolean}) => {
    const config = {...defaultGlobalFilterConfig, ...scene.readFilterConfig()};

    return (
        <Dialog
            className="datavisool-global-filter-dialog"
            bodyClassName="datavisool-global-filter-body"
            width="min(760px, calc(100vw - 32px))"
            open={true}
            onClose={onClose}
            mask
            centered
            hideHeader
            showClose
        >
            <div className="datavisool-global-filter-config">
                <header className="global-filter-header">
                    <div className="global-filter-heading">
                        <div className="global-filter-title-row">
                            <h2>全局滤镜</h2>
                            <span className={`global-filter-state ${config.enable ? 'enabled' : ''}`} role="status">
                                {config.enable ? '已开启' : '未开启'}
                            </span>
                        </div>
                        <p>统一调整画布的模糊、亮度、对比度与色彩。</p>
                    </div>
                </header>
                <div className="global-filter-panel">
                    <FilterControls
                        variant="global"
                        config={config}
                        previewImage={globalFilterVisual}
                        onChange={next => { if (canEdit()) scene.updateFilterConfig(next); }}
                        enableLabel="启用全局滤镜"
                        enableDescription="开启后，参数会实时作用于当前画布。"
                        previewCaption="效果预览"
                        parametersTitle="滤镜参数"
                    />
                </div>
                <footer className="global-filter-footer">
                    <Button type="primary" onClick={onClose} className="btn-confirm" icon={<Check theme="outline" size={16} strokeWidth={1.75} fill="currentColor"/>}>完成</Button>
                </footer>
            </div>
        </Dialog>
    );
});

export default GlobalFilterConfigImpl;
