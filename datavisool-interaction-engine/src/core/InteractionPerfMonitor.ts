/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
export interface InteractionPerfSnapshot {
    frameFlushes: number;
    domWrites: number;
    dragCommits: number;
    dragCancels: number;
    maxFrameCostMs: number;
    lastFrameCostMs: number;
    maxComputeCostMs: number;
    lastComputeCostMs: number;
    maxDomWriteCostMs: number;
    lastDomWriteCostMs: number;
    droppedFrameCount: number;
    activeLayerCount: number;
    snapCandidateCount: number;
}

export class InteractionPerfMonitor {
    private frameFlushes = 0;

    private domWrites = 0;

    private dragCommits = 0;

    private dragCancels = 0;

    private maxFrameCostMs = 0;

    private lastFrameCostMs = 0;

    private maxComputeCostMs = 0;

    private lastComputeCostMs = 0;

    private maxDomWriteCostMs = 0;

    private lastDomWriteCostMs = 0;

    private droppedFrameCount = 0;

    private activeLayerCount = 0;

    private snapCandidateCount = 0;

    recordFrameFlush(costMs = 0) {
        this.frameFlushes += 1;
        this.lastFrameCostMs = normalizeCost(costMs);
        this.maxFrameCostMs = Math.max(this.maxFrameCostMs, this.lastFrameCostMs);

        if (this.lastFrameCostMs > 16.67) {
            this.droppedFrameCount += 1;
        }
    }

    recordDomWrites(count: number) {
        this.domWrites += count;
    }

    recordDragCommit() {
        this.dragCommits += 1;
    }

    recordDragCancel() {
        this.dragCancels += 1;
    }

    recordComputeCost(costMs: number) {
        this.lastComputeCostMs = normalizeCost(costMs);
        this.maxComputeCostMs = Math.max(this.maxComputeCostMs, this.lastComputeCostMs);
    }

    recordDomWriteCost(costMs: number) {
        this.lastDomWriteCostMs = normalizeCost(costMs);
        this.maxDomWriteCostMs = Math.max(this.maxDomWriteCostMs, this.lastDomWriteCostMs);
    }

    setActiveLayerCount(count: number) {
        this.activeLayerCount = normalizeCount(count);
    }

    setSnapCandidateCount(count: number) {
        this.snapCandidateCount = normalizeCount(count);
    }

    snapshot(): InteractionPerfSnapshot {
        return {
            frameFlushes: this.frameFlushes,
            domWrites: this.domWrites,
            dragCommits: this.dragCommits,
            dragCancels: this.dragCancels,
            maxFrameCostMs: this.maxFrameCostMs,
            lastFrameCostMs: this.lastFrameCostMs,
            maxComputeCostMs: this.maxComputeCostMs,
            lastComputeCostMs: this.lastComputeCostMs,
            maxDomWriteCostMs: this.maxDomWriteCostMs,
            lastDomWriteCostMs: this.lastDomWriteCostMs,
            droppedFrameCount: this.droppedFrameCount,
            activeLayerCount: this.activeLayerCount,
            snapCandidateCount: this.snapCandidateCount,
        };
    }

    reset() {
        this.frameFlushes = 0;
        this.domWrites = 0;
        this.dragCommits = 0;
        this.dragCancels = 0;
        this.maxFrameCostMs = 0;
        this.lastFrameCostMs = 0;
        this.maxComputeCostMs = 0;
        this.lastComputeCostMs = 0;
        this.maxDomWriteCostMs = 0;
        this.lastDomWriteCostMs = 0;
        this.droppedFrameCount = 0;
        this.activeLayerCount = 0;
        this.snapCandidateCount = 0;
    }
}

function normalizeCost(value: number) {
    return Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : 0;
}

function normalizeCount(value: number) {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
