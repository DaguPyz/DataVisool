/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {makeAutoObservable} from 'mobx';
import {clampViewportScale, type ViewportCamera, type ViewportPoint} from './ViewportMath.ts';

export type ViewportToolMode = 'select' | 'hand';

export interface ViewportControl {
    zoomBy: (factor: number, anchor?: ViewportPoint) => void;
    setScale: (scale: number, anchor?: ViewportPoint) => void;
    fitArtboard: () => void;
    reset: () => void;
    centerOn: (point: ViewportPoint) => void;
    refresh: () => void;
}

class ViewportStore {
    translationX = 0;
    translationY = 0;
    scale = 1;
    toolMode: ViewportToolMode = 'select';
    showRulers = false;
    control: ViewportControl | null = null;

    constructor() {
        makeAutoObservable(this, {control: false}, {autoBind: true});
    }

    get camera(): ViewportCamera {
        return {
            translationX: this.translationX,
            translationY: this.translationY,
            scale: this.scale,
        };
    }

    setCamera(camera: ViewportCamera) {
        this.translationX = Number.isFinite(camera.translationX) ? camera.translationX : this.translationX;
        this.translationY = Number.isFinite(camera.translationY) ? camera.translationY : this.translationY;
        this.scale = clampViewportScale(camera.scale);
    }

    panBy(dx: number, dy: number) {
        if (Number.isFinite(dx)) this.translationX += dx;
        if (Number.isFinite(dy)) this.translationY += dy;
    }

    setToolMode(mode: ViewportToolMode) {
        this.toolMode = mode;
    }

    toggleRulers() {
        this.showRulers = !this.showRulers;
    }

    attachControl(control: ViewportControl | null) {
        this.control = control;
    }

    zoomBy(factor: number, anchor?: ViewportPoint) {
        this.control?.zoomBy(factor, anchor);
    }

    setScale(scale: number, anchor?: ViewportPoint) {
        this.control?.setScale(scale, anchor);
    }

    fitArtboard() {
        this.control?.fitArtboard();
    }

    reset() {
        this.control?.reset();
    }

    centerOn(point: ViewportPoint) {
        this.control?.centerOn(point);
    }

    refresh() {
        this.control?.refresh();
    }
}

const viewportStore = new ViewportStore();
export default viewportStore;
