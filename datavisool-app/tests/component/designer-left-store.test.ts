/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test} from "vitest";
import designerLeftStore from "@/designer/left/DesignerLeftStore.ts";

describe("DesignerLeftStore panel state", () => {
    afterEach(() => {
        designerLeftStore.closePanel(false);
        designerLeftStore.setActiveModule("components");
        designerLeftStore.closePanel(false);
    });

    test("hides the legacy menu while closed and restores the active module when reopened", () => {
        designerLeftStore.setMenu("layer-list");
        expect(designerLeftStore.menu).toBe("layer-list");

        designerLeftStore.closePanel(false);
        expect(designerLeftStore.panelOpen).toBe(false);
        expect(designerLeftStore.menu).toBe("");
        expect(designerLeftStore.activeModule).toBe("layer-list");

        designerLeftStore.openPanel();
        expect(designerLeftStore.menu).toBe("layer-list");
    });
});
