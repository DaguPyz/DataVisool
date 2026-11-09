/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {render} from "@testing-library/react";
import {beforeEach, describe, expect, test, vi} from "vitest";
import * as THREE from "three";

const loaderMocks = vi.hoisted(() => ({object: null as unknown}));

vi.mock("@react-three/fiber", () => ({
    useLoader: () => loaderMocks.object,
    useFrame: vi.fn(),
}));

vi.mock("@react-three/drei", () => ({
    Center: () => null,
}));

import {ThreeModelLoader} from "@/comps/builtin/3d-model/ThreeModelLoader.tsx";

describe("ThreeModelLoader scene ready callback", () => {
    beforeEach(() => {
        const root = new THREE.Group();
        root.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2)));
        loaderMocks.object = {scene: root, animations: []};
    });

    test("reports the cloned scene after the model is prepared", () => {
        const onSceneReady = vi.fn();

        render(
            <ThreeModelLoader
                url="model.glb"
                format="glb"
                autoCenter
                onSceneReady={onSceneReady}
            />,
        );

        expect(onSceneReady).toHaveBeenCalledTimes(1);
        const readyScene = onSceneReady.mock.calls[0][0];
        expect(readyScene).toBeInstanceOf(THREE.Object3D);
        expect(readyScene).not.toBe((loaderMocks.object as {scene: THREE.Object3D}).scene);
    });
});
