/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from "vitest";
import GlobalFilterManger from "@/designer/manager/GlobalFilterManger.ts";
import {DesignerMode, DesignerScene} from "@datavisool/sdk/types";

vi.mock("@/designer/header/items/canvas/CanvasManager.ts", () => ({
    default: class {
        init = vi.fn();
        getData = vi.fn(() => ({}));
        destroy = vi.fn();
    }
}));
vi.mock("@/designer/header/items/theme/ThemeManager.ts", () => ({
    default: class {
        init = vi.fn();
        getData = vi.fn(() => ({}));
        destroy = vi.fn();
    }
}));
vi.mock("@/designer/blueprint/manager/BluePrintManager.ts", () => ({
    default: class {
        init = vi.fn();
        getData = vi.fn(() => []);
        destroy = vi.fn();
    }
}));
vi.mock("@/designer/manager/LayerManager.ts", () => ({
    default: class {
        init = vi.fn();
        getData = vi.fn(() => ({}));
        destroy = vi.fn();
    }
}));
vi.mock("@/designer/blueprint/core/BPExecutor.ts", () => ({
    default: class {}
}));
vi.mock("@/designer/manager/GlobalVariableManager.ts", () => ({
    default: class {
        init = vi.fn();
        getData = vi.fn(() => ({}));
        destroy = vi.fn();
    }
}));

describe("GlobalFilterManger", () => {
    it("读取桌面端配置后保持原字段并生成滤镜样式", () => {
        const manager = new GlobalFilterManger();
        manager.init({
            config: {
                enable: true,
                blur: 2,
                brightness: 1.2,
                contrast: 0.8,
                opacity: 0.9,
                saturate: 1.5,
                hueRotate: 45
            }
        });

        expect(manager.getData()).toEqual({
            config: {
                enable: true,
                blur: 2,
                brightness: 1.2,
                contrast: 0.8,
                opacity: 0.9,
                saturate: 1.5,
                hueRotate: 45
            }
        });
        expect(manager.getFilterStyle()).toEqual({
            filter: "blur(2px) brightness(1.2) contrast(0.8) opacity(0.9) saturate(1.5) hue-rotate(45deg)"
        });
    });

    it("旧工程缺少配置时使用桌面端默认值", () => {
        const manager = new GlobalFilterManger();
        manager.init(undefined);

        expect(manager.getData()).toEqual({
            config: {
                enable: false,
                blur: 0,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 0
            }
        });
        expect(manager.getFilterStyle()).toEqual({});
    });

    it("设计器读取和保存时保留桌面端工程字段", async () => {
        const {default: DesignerManager} = await import("@/designer/manager/DesignerManager.ts");
        const manager = new DesignerManager(DesignerScene.DEFAULT);
        manager.init({
            globalFilterManger: {
                config: {
                    enable: true,
                    blur: 4,
                    hueRotate: 90
                }
            }
        }, DesignerMode.EDIT);

        expect(manager.getData().globalFilterManger).toEqual({
            config: {
                enable: true,
                blur: 4,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 90
            }
        });
    });
});
