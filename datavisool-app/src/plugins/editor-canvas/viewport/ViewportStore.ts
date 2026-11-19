/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {makeAutoObservable} from 'mobx';
import {clampViewportScale, type ViewportCamera, type ViewportPoint} from '@/plugins/editor-canvas/viewport/ViewportMath.ts';

export type ViewportToolMode = 'select' | 'hand';

export interface ViewportControl {
    pause: () => void;
    zoomBy: (factor: number, anchor?: ViewportPoint) => void;
    setScale: (scale: number, anchor?: ViewportPoint) => void;
    fitArtboard: () => void;
    reset: () => void;
    centerOn: (point: ViewportPoint) => void;
    refresh: () => void;
}

export class ViewportStore {
    translationX = 0;
    translationY = 0;
    scale = 1;
    toolMode: ViewportToolMode = 'select';
    showRulers = false;
    control: ViewportControl | null = null;

    constructor(private readonly canEdit: () => boolean = () => true) {
        makeAutoObservable<ViewportStore, 'canEdit'>(this, {control: false, canEdit: false}, {autoBind: true});
    }

    get camera(): ViewportCamera {
        return {
            translationX: this.translationX,
            translationY: this.translationY,
            scale: this.scale,
        };
    }

    canInteract(): boolean { return this.canEdit(); }

    setCamera(camera: ViewportCamera) {
        if (!this.canEdit()) return;
        this.translationX = Number.isFinite(camera.translationX) ? camera.translationX : this.translationX;
        this.translationY = Number.isFinite(camera.translationY) ? camera.translationY : this.translationY;
        this.scale = clampViewportScale(camera.scale);
    }

    panBy(dx: number, dy: number) {
        if (!this.canEdit()) return;
        if (Number.isFinite(dx)) this.translationX += dx;
        if (Number.isFinite(dy)) this.translationY += dy;
    }

    setToolMode(mode: ViewportToolMode) {
        if (!this.canEdit()) return;
        this.toolMode = mode;
    }

    toggleRulers() {
        if (!this.canEdit()) return;
        this.showRulers = !this.showRulers;
    }

    attachControl(control: ViewportControl | null) {
        this.control = control;
    }

    zoomBy(factor: number, anchor?: ViewportPoint) {
        if (this.canEdit()) this.control?.zoomBy(factor, anchor);
    }

    setScale(scale: number, anchor?: ViewportPoint) {
        if (this.canEdit()) this.control?.setScale(scale, anchor);
    }

    fitArtboard() {
        if (this.canEdit()) this.control?.fitArtboard();
    }

    reset() {
        if (this.canEdit()) this.control?.reset();
    }

    pause() {
        this.control?.pause();
    }

    centerOn(point: ViewportPoint) {
        if (this.canEdit()) this.control?.centerOn(point);
    }

    refresh() {
        this.control?.refresh();
    }
}

