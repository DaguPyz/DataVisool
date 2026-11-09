/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {observer} from 'mobx-react';
import {FullScreen, ZoomIn, ZoomOut} from '@icon-park/react';
import './BPZoomControls.less';

const MIN_PERCENT = 5;
const MAX_PERCENT = 500;
const ZOOM_STEP = 1.2;

const clampPercent = (percent: number) => Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent));

const BPZoomControls = observer(() => {
    const manager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
    const controller = manager.viewportController;
    const scale = manager.canvasScale;
    const percent = Number.isFinite(scale) ? clampPercent(Math.round(scale * 100)) : 100;
    const ready = Boolean(controller);
    const canZoomOut = ready && Number.isFinite(scale) && scale > MIN_PERCENT / 100;
    const canZoomIn = ready && Number.isFinite(scale) && scale < MAX_PERCENT / 100;
    const [draft, setDraft] = useState(String(percent));
    const [editing, setEditing] = useState(false);
    const cancelBlurCommit = useRef(false);
    const isComposing = useRef(false);

    useEffect(() => {
        if (!editing)
            setDraft(String(percent));
    }, [editing, percent]);

    const restoreCurrent = () => {
        setDraft(String(percent));
        setEditing(false);
    };

    const commit = () => {
        const raw = draft.trim().replace(/%/g, '');
        const value = Number(raw);
        if (!controller || raw === '' || !Number.isFinite(value) || value <= 0) {
            restoreCurrent();
            return;
        }
        controller.setScale(clampPercent(value) / 100);
        setEditing(false);
    };

    const handleBlur = () => {
        if (cancelBlurCommit.current) {
            cancelBlurCommit.current = false;
            restoreCurrent();
            return;
        }
        commit();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        // Do not let canvas/global shortcuts receive keys typed into this field.
        event.stopPropagation();
        if (isComposing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
            return;
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelBlurCommit.current = true;
            event.currentTarget.blur();
        }
    };

    return (
        <div className="bp-zoom-controls" role="group" aria-label="画布缩放" data-bp-ui>
            <button type="button" className="bp-zoom-icon-button" aria-label="缩小画布" title="缩小画布"
                    disabled={!canZoomOut} onClick={() => controller?.zoomBy(1 / ZOOM_STEP)}>
                <ZoomOut theme="outline" size={18} aria-hidden="true"/>
            </button>
            <label className="bp-zoom-value" title="输入缩放百分比">
                <input aria-label="缩放百分比" inputMode="decimal" value={editing ? draft : `${percent}%`}
                       disabled={!ready}
                       onFocus={(event) => {
                           cancelBlurCommit.current = false;
                           setEditing(true);
                           // Keep the controlled DOM value stable until select() takes effect.
                           setDraft(`${percent}%`);
                           event.currentTarget.select();
                       }}
                       onChange={(event) => setDraft(event.target.value.replace(/%/g, ''))}
                       onCompositionStart={() => { isComposing.current = true; }}
                       onCompositionEnd={() => { isComposing.current = false; }}
                       onBlur={handleBlur}
                       onKeyDown={handleKeyDown}/>
            </label>
            <button type="button" className="bp-zoom-icon-button" aria-label="放大画布" title="放大画布"
                    disabled={!canZoomIn} onClick={() => controller?.zoomBy(ZOOM_STEP)}>
                <ZoomIn theme="outline" size={18} aria-hidden="true"/>
            </button>
            <span className="bp-zoom-divider" aria-hidden="true"/>
            <button type="button" className="bp-zoom-fit-button" aria-label="适配全部节点" title="适配全部节点"
                    disabled={!ready} onClick={() => controller?.fitAll()}>
                <FullScreen theme="outline" size={17} aria-hidden="true"/>
                <span>适配</span>
            </button>
            <button type="button" className="bp-zoom-reset-button" aria-label="重置视图"
                    title="重置视图" disabled={!ready} onClick={() => controller?.setScale(1)}>
                100%
            </button>
        </div>
    );
});

export default BPZoomControls;
