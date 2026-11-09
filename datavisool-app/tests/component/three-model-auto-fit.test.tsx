/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from "react";
import {act, render} from "@testing-library/react";
import {beforeEach, describe, expect, test, vi} from "vitest";
import * as THREE from "three";

const fiberMocks = vi.hoisted(() => ({state: null as any}));
const loaderMocks = vi.hoisted(() => ({render: vi.fn()}));

vi.mock("@react-three/fiber", async () => {
    const ReactModule = await import("react");
    return {
        Canvas: ({children}: {children: React.ReactNode}) => ReactModule.createElement(
            ReactModule.Fragment,
            null,
            ReactModule.Children.toArray(children).filter((child) => {
                return ReactModule.isValidElement(child) && typeof child.type !== "string";
            }),
        ),
        useThree: (selector: (state: any) => unknown) => selector(fiberMocks.state),
    };
});

vi.mock("@react-three/drei", () => ({
    OrbitControls: () => null,
    Environment: () => null,
    Html: ({children}: {children: React.ReactNode}) => children,
    useProgress: () => ({progress: 100}),
    Sky: () => null,
    ContactShadows: () => null,
}));

vi.mock("@/comps/builtin/3d-model/ThreeModelLoader.tsx", () => ({
    ThreeModelLoader: (props: unknown) => {
        loaderMocks.render(props);
        return null;
    },
}));

import {ThreeModelComponent} from "@/comps/builtin/3d-model/ThreeModelComponent.tsx";

const createThreeState = () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 2000);
    camera.position.set(0, 0, 10);
    const controls = {
        target: new THREE.Vector3(),
        update: vi.fn(),
    };
    return {
        camera,
        controls,
        size: {width: 800, height: 400},
    };
};

const createOffsetModel = () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2));
    object.position.set(10, 20, 30);
    object.updateMatrixWorld(true);
    return object;
};

const renderModel = (camera: Record<string, unknown>) => {
    render(<ThreeModelComponent {...({
        style: {
            source: {url: "model.glb", format: "glb"},
            camera,
        },
    } as any)}/>);
};

const notifySceneReady = (object: THREE.Object3D) => {
    const lastRender = loaderMocks.render.mock.calls[loaderMocks.render.mock.calls.length - 1]?.[0] as {
        onSceneReady?: (scene: THREE.Object3D) => void;
    };
    expect(lastRender.onSceneReady).toBeTypeOf("function");
    act(() => lastRender.onSceneReady?.(object));
};

describe("ThreeModelComponent auto fit camera", () => {
    beforeEach(() => {
        loaderMocks.render.mockClear();
        fiberMocks.state = createThreeState();
    });

    test.each([
        ["target is missing", {fov: 60, position: [0, 0, 10]}],
        ["position is missing", {fov: 60, target: [4, 5, 6]}],
    ])("fits the loaded model when the custom camera %s", (_label, cameraConfig) => {
        renderModel(cameraConfig);
        notifySceneReady(createOffsetModel());

        const center = new THREE.Vector3(10, 20, 30);
        const fitHeightDistance = 4 / (2 * Math.tan(THREE.MathUtils.degToRad(30)));
        const expectedDistance = fitHeightDistance * 1.2;

        expect(fiberMocks.state.camera.position.distanceTo(center)).toBeCloseTo(expectedDistance, 6);
        expect(fiberMocks.state.camera.near).toBeCloseTo(expectedDistance / 100, 6);
        expect(fiberMocks.state.camera.far).toBeCloseTo(expectedDistance * 100, 6);
        expect(fiberMocks.state.controls.target.toArray()).toEqual(center.toArray());
        expect(fiberMocks.state.controls.update).toHaveBeenCalled();
    });

    test("keeps the configured view when both camera position and target are complete", () => {
        renderModel({
            fov: 50,
            position: [1, 2, 3],
            target: [4, 5, 6],
        });
        notifySceneReady(createOffsetModel());

        expect(fiberMocks.state.camera.position.toArray()).toEqual([1, 2, 3]);
        expect(fiberMocks.state.controls.target.toArray()).toEqual([4, 5, 6]);
    });
});
