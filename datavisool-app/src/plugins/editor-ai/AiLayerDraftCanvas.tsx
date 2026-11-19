/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useEffect, useRef} from 'react';
import type {EditorAiEditingSession} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {tx} from '@/i18n/miniI18n.ts';
import './AiLayerDraftCanvas.less';

export interface AiLayerDraftCanvasProps {
    readonly session?: EditorAiEditingSession;
    readonly revision: number;
}

/** Render runtime-owned detached draft batches through the scoped canvas handle. */
const AiLayerDraftCanvas = ({session, revision}: AiLayerDraftCanvasProps) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const activeDraft = session?.isActive() ? session.readDraft() : undefined;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const stopDesignerPointerDown = (event: PointerEvent) => {
            if (event.button === 0) event.stopPropagation();
        };
        canvas.addEventListener('pointerdown', stopDesignerPointerDown);
        return () => canvas.removeEventListener('pointerdown', stopDesignerPointerDown);
    }, [activeDraft?.draftId, revision]);

    if (!session || !activeDraft) return null;
    return (
        <div className="ai-layer-draft-canvas" key={`${activeDraft.draftId}-${activeDraft.revision}`} ref={canvasRef}>
            {activeDraft.batches.map(batch => (
                <div className="ai-layer-draft-batch" data-draft-batch={batch.sequence} key={batch.batchId}>
                    {session.renderDraftBatch(batch.batchId)}
                    <div
                        className="ai-layer-draft-batch-hit-area"
                        onMouseDown={event => event.stopPropagation()}
                        onClick={event => event.stopPropagation()}
                        style={{left: batch.bounds.x, top: batch.bounds.y, width: batch.bounds.width, height: batch.bounds.height}}
                    >
                        {activeDraft.interactive && (
                            <div className="ai-layer-draft-batch-actions">
                                <span className="ai-layer-draft-batch-label">{tx('批次')} {batch.sequence}</span>
                                <button className="ai-layer-draft-batch-button is-accept" type="button" onClick={event => {
                                    event.stopPropagation();
                                    session.acceptDraftBatch(batch.batchId);
                                }}>{tx('接受')}</button>
                                <button className="ai-layer-draft-batch-button is-discard" type="button" onClick={event => {
                                    event.stopPropagation();
                                    session.discardDraftBatch(batch.batchId);
                                }}>{tx('丢弃')}</button>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AiLayerDraftCanvas;
