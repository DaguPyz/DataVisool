/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, waitFor} from "@testing-library/react";
import LoopContainer from "@/comps/loop-container/LoopContainer.tsx";
import ScreenReferenceComponent from "@/comps/builtin/screen-reference/ScreenReferenceComponent.tsx";
import GlobalFilterConfigImpl from "@/designer/header/items/global-filter/GlobalFilterConfigImpl.tsx";
import {DesignerMode} from "@datavisool/sdk/types";

const filterStyle = {
    filter: "blur(2px) brightness(1.2) contrast(0.8) opacity(0.9) saturate(1.5) hue-rotate(45deg)"
};

const screenReferenceManager = vi.hoisted(() => ({
    canvasManager: {canvasConfig: {width: 320, height: 180}},
    globalFilterManger: {
        getFilterStyle: vi.fn(() => ({
            filter: "blur(2px) brightness(1.2) contrast(0.8) opacity(0.9) saturate(1.5) hue-rotate(45deg)"
        }))
    },
    destroy: vi.fn()
}));

vi.mock("@datavisool/ui", () => ({
    Button: ({children}: {children: React.ReactNode}) => children,
    Dialog: ({children}: {children: React.ReactNode}) => children,
    Loading: () => null,
    Slider: () => null,
    Switch: () => null,
    globalMessage: {messageApi: {error: vi.fn()}}
}));

vi.mock("@/designer/left/layer-list/CanvasRender.ts", () => ({
    default: {
        buildCanvasComponents: vi.fn(() => [])
    }
}));

vi.mock("@/designer/loader/DesignerLoader.ts", () => ({
    default: class {}
}));

vi.mock("@/designer/loader/ViewDesignerLoader.ts", () => ({
    default: class {
        designerManager = screenReferenceManager;
        simpleLoad = vi.fn(async () => undefined);
        cancelLoad = vi.fn();
    }
}));

vi.mock("@/util/EnvUtil.ts", () => ({
    default: {
        getModeByUrl: vi.fn(() => "1")
    }
}));

describe("global filter rendering", () => {
    beforeEach(() => {
        (window as any).DATAVISOOL_ENV = {
            mode: DesignerMode.EDIT,
            currentManager: {
                globalFilterManger: {
                    config: {
                        enable: true,
                        blur: 2,
                        brightness: 1.2,
                        contrast: 0.8,
                        opacity: 0.9,
                        saturate: 1.5,
                        hueRotate: 45
                    },
                    getFilterStyle: vi.fn(() => filterStyle),
                    updateConfig: vi.fn()
                }
            }
        };
    });

    it("applies the nested manager filter to every loop canvas", () => {
        const manager = {
            canvasManager: {canvasConfig: {width: 320, height: 180}},
            globalFilterManger: {getFilterStyle: vi.fn(() => filterStyle)},
            layerManager: {controllers: {}},
            bpExecutor: {triggerComponentEvent: vi.fn()}
        };
        const {container} = render(
            <LoopContainer
                manager={manager as any}
                base={{id: "loop", type: "LoopContainer"} as any}
                data={{value: [{id: 1}, {id: 2}]} as any}
            />
        );

        const loopItems = container.querySelectorAll<HTMLElement>(".loop-item");
        expect(loopItems).toHaveLength(2);
        loopItems.forEach((item) => {
            expect(item.style.filter).toBe(filterStyle.filter);
        });
    });

    it("applies the referenced project filter to the embedded canvas", async () => {
        (window as any).DATAVISOOL_ENV.mode = DesignerMode.PREVIEW;
        const {container} = render(
            <ScreenReferenceComponent
                base={{id: "reference", type: "ScreenReference"} as any}
                style={{screenId: "screen-1"}}
            />
        );

        await waitFor(() => {
            const filteredCanvas = Array.from(container.querySelectorAll<HTMLElement>("div"))
                .find((element) => element.style.filter === filterStyle.filter);
            expect(filteredCanvas).toBeDefined();
        });
    });

    it("applies the current filter to the dialog preview image", () => {
        const {container} = render(<GlobalFilterConfigImpl/>);

        const preview = container.querySelector<HTMLImageElement>(".global-filter-visual img");
        expect(preview?.style.filter).toBe(filterStyle.filter);
    });
});
