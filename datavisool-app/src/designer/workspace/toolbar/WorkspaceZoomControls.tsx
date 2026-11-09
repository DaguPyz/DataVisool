/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {observer} from 'mobx-react';
import {FullScreen, ZoomIn, ZoomOut} from '@icon-park/react';
import {useEffect, useRef, useState} from 'react';
import viewportStore from '@/designer/workspace/viewport/ViewportStore.ts';
import useToolbarMagnification from './useToolbarMagnification.ts';
import './WorkspaceZoomControls.less';

const WorkspaceZoomControls = observer(() => {
    const toolbarRef = useToolbarMagnification();
    const [draft, setDraft] = useState(String(Math.round(viewportStore.scale * 100)));
    const [editing, setEditing] = useState(false);
    const cancelBlurCommit = useRef(false);
    const percent = Math.round(viewportStore.scale * 100);

    useEffect(() => {
        if (!editing) setDraft(String(percent));
    }, [editing, percent]);

    const commit = () => {
        const value = Number(draft);
        if (Number.isFinite(value) && value > 0)
            viewportStore.setScale(value / 100);
        else
            setDraft(String(percent));
        setEditing(false);
    };

    const handleBlur = () => {
        if (cancelBlurCommit.current) {
            cancelBlurCommit.current = false;
            setDraft(String(Math.round(viewportStore.scale * 100)));
            setEditing(false);
            return;
        }
        commit();
    };

    return (
        <div ref={toolbarRef} className="workspace-zoom-controls" role="group" aria-label="画布缩放" data-viewport-ui="" data-toolbar-magnification="">
            <button type="button" className="workspace-icon-button" aria-label="缩小画布" title="缩小"
                    onClick={() => viewportStore.zoomBy(1 / 1.2)}><ZoomOut theme="outline" size={18}/></button>
            <label className="workspace-zoom-value" title="输入缩放百分比">
                <input
                    aria-label="缩放百分比"
                    inputMode="decimal"
                    value={editing ? draft : `${percent}%`}
                    onFocus={(event) => {
                        cancelBlurCommit.current = false;
                        setEditing(true);
                        setDraft(String(percent));
                        event.currentTarget.select();
                    }}
                    onChange={(event) => setDraft(event.target.value.replace(/%/g, ''))}
                    onBlur={handleBlur}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') {
                            cancelBlurCommit.current = true;
                            setDraft(String(percent));
                            setEditing(false);
                            event.currentTarget.blur();
                        }
                    }}
                />
            </label>
            <button type="button" className="workspace-icon-button" aria-label="放大画布" title="放大"
                    onClick={() => viewportStore.zoomBy(1.2)}><ZoomIn theme="outline" size={18}/></button>
            <span className="workspace-zoom-divider" aria-hidden="true"/>
            <button type="button" className="workspace-icon-button workspace-fit-button" aria-label="适配画板" title="适配画板"
                    onClick={() => viewportStore.fitArtboard()}><FullScreen theme="outline" size={17}/><span>适配</span></button>
            <button type="button" className="workspace-icon-button workspace-reset-button" aria-label="重置视图" title="重置视图为 100%"
                    onClick={() => viewportStore.setScale(1)}><span className="workspace-magnify-text">100%</span></button>
        </div>
    );
});

export default WorkspaceZoomControls;
