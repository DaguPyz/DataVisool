/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef} from "react";
import {observer} from "mobx-react";
import {aiLayerDraftRuntime} from "@/designer/ai-driven/AiLayerDraftRuntime.ts";
import canvasRender from "@/designer/left/layer-list/CanvasRender.ts";
import {tx} from "@/i18n/miniI18n.ts";
import "./AiLayerDraftCanvas.less";

/** 使用正式画布渲染链路展示不可编辑的临时组件。 */
const AiLayerDraftCanvas = observer(() => {
    const activeDraft = aiLayerDraftRuntime.activeDraft;
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => () => aiLayerDraftRuntime.clear(), []);
    useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas)
            return undefined;

        const stopDesignerPointerDown = (event: PointerEvent) => {
            if (event.button === 0)
                event.stopPropagation();
        };

        canvas.addEventListener("pointerdown", stopDesignerPointerDown);
        return () => canvas.removeEventListener("pointerdown", stopDesignerPointerDown);
    }, [activeDraft]);

    if (!activeDraft)
        return null;

    return (
        <div
            className="ai-layer-draft-canvas"
            key={activeDraft.layout ? activeDraft.draftId : `${activeDraft.draftId}-${activeDraft.revision}`}
            ref={canvasRef}
        >
            {activeDraft.batches.map((batch) => (
                <div className="ai-layer-draft-batch" data-draft-batch={batch.sequence} key={batch.batchId}>
                    {canvasRender.buildCanvasComponents(batch.manager, "-ai-draft")}
                    <div
                        className="ai-layer-draft-batch-hit-area"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            left: batch.bounds.x,
                            top: batch.bounds.y,
                            width: batch.bounds.width,
                            height: batch.bounds.height,
                        }}
                    >
                        {activeDraft.interactive && (
                            <div className="ai-layer-draft-batch-actions">
                                <span className="ai-layer-draft-batch-label">{tx("批次")} {batch.sequence}</span>
                                <button
                                    className="ai-layer-draft-batch-button is-accept"
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        aiLayerDraftRuntime.acceptBatch(batch.batchId);
                                    }}
                                >
                                    {tx("接受")}
                                </button>
                                <button
                                    className="ai-layer-draft-batch-button is-discard"
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        aiLayerDraftRuntime.discardBatch(batch.batchId);
                                    }}
                                >
                                    {tx("丢弃")}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
});

export default AiLayerDraftCanvas;
