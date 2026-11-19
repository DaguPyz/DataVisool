/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {observable, runInAction} from 'mobx';
import type {ICanvasManager, ILayerItem} from '@datavisool/sdk/types';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';

export interface EditorCanvasOptionsSnapshot {
    readonly rasterize?: boolean;
    readonly dragStep?: number;
    readonly resizeStep?: number;
    readonly boxSelectionMode?: ICanvasManager['boxSelectionMode'];
    readonly enableAdsorption?: boolean;
    readonly enableEvent?: boolean;
}

type CanvasSceneWithOptions = DesignerEditingScene & {
    readCanvasOptions(): EditorCanvasOptionsSnapshot | undefined;
    updateCanvasOptions(patch: Partial<EditorCanvasOptionsSnapshot>): boolean;
};

interface EditorCanvasSceneSnapshot {
    readonly scene: DesignerEditingScene;
    readonly version: number;
    readonly name?: string;
    readonly layers: Readonly<Record<string, ILayerItem>>;
    readonly canvas: Readonly<ICanvasManager>;
    readonly options: EditorCanvasOptionsSnapshot;
}

const EMPTY_LAYERS: Readonly<Record<string, ILayerItem>> = Object.freeze({});
const EMPTY_OPTIONS: EditorCanvasOptionsSnapshot = Object.freeze({});

/** Per-activation observable mirror of detached runtime scene DTOs. */
export class EditorCanvasSceneStore {
    private readonly snapshot = observable.box<EditorCanvasSceneSnapshot | undefined>(undefined, {deep: false});
    private readonly revisionBox = observable.box(0);

    constructor(
        private readonly readScene: () => DesignerEditingScene | undefined,
        private readonly isSceneActive: () => boolean,
        private readonly canEdit: () => boolean,
    ) {}

    get revision(): number { return this.revisionBox.get(); }

    refresh(): void {
        const scene = this.isSceneActive() ? this.readScene() : undefined;
        const source = scene?.layers.read();
        if (!scene || !scene.identity || !source || source.sceneIdentity !== scene.identity
            || source.sceneVersion !== scene.version || !scene.isActive()) {
            runInAction(() => {
                this.snapshot.set(undefined);
                this.revisionBox.set(this.revisionBox.get() + 1);
            });
            return;
        }
        const options = (scene as CanvasSceneWithOptions).readCanvasOptions?.() ?? EMPTY_OPTIONS;
        runInAction(() => {
            this.snapshot.set(Object.freeze({
                scene,
                version: scene.version,
                name: scene.name,
                layers: source.layers as Readonly<Record<string, ILayerItem>>,
                canvas: source.canvas,
                options: Object.freeze({...options}),
            }));
            this.revisionBox.set(this.revisionBox.get() + 1);
        });
    }

    reset(): void {
        runInAction(() => {
            this.snapshot.set(undefined);
            this.revisionBox.set(this.revisionBox.get() + 1);
        });
    }

    readLayerConfigs(): Readonly<Record<string, ILayerItem>> {
        this.revisionBox.get();
        return this.snapshot.get()?.layers ?? EMPTY_LAYERS;
    }

    readCanvasConfig(): Readonly<ICanvasManager> | undefined {
        this.revisionBox.get();
        return this.snapshot.get()?.canvas;
    }

    readOptions(): EditorCanvasOptionsSnapshot {
        this.revisionBox.get();
        return this.snapshot.get()?.options ?? EMPTY_OPTIONS;
    }

    readName(): string | undefined {
        this.revisionBox.get();
        return this.snapshot.get()?.name;
    }

    readVersion(): number {
        this.revisionBox.get();
        return this.snapshot.get()?.version ?? -1;
    }

    updateOptions(patch: Partial<EditorCanvasOptionsSnapshot>): boolean {
        if (!this.canEdit()) return false;
        const scene = this.readScene() as CanvasSceneWithOptions | undefined;
        const current = this.snapshot.get();
        if (!scene || !current || current.scene !== scene || current.version !== scene.version
            || !scene.updateCanvasOptions(patch)) return false;
        this.refresh();
        return true;
    }
}
