/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {observable, runInAction} from 'mobx';

/** Mutable lifecycle gate shared by one editor-canvas activation only. */
export class EditorCanvasActivationState {
    private readonly acceptingBox = observable.box(true);
    private active = true;

    get accepting(): boolean { return this.active && this.acceptingBox.get(); }

    canEdit(sceneIsCurrent: () => boolean): boolean {
        return this.active && this.acceptingBox.get() && sceneIsCurrent();
    }

    pause(): void {
        if (this.active) runInAction(() => this.acceptingBox.set(false));
    }

    resume(): void {
        if (this.active) runInAction(() => this.acceptingBox.set(true));
    }

    deactivate(): void {
        this.active = false;
        runInAction(() => this.acceptingBox.set(false));
    }
}
