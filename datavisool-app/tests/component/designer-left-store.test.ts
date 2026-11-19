/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test} from "vitest";
import {DesignerDockState} from "@/plugins/editor-shell/dock/DesignerDockState.ts";
const designerLeftStore = new DesignerDockState(() => 1);

describe("DesignerLeftStore panel state", () => {
    afterEach(() => {
        designerLeftStore.closePanel(false);
        designerLeftStore.setActiveModule("components");
        designerLeftStore.closePanel(false);
    });

    test("preserves the active module when its panel closes and reopens", () => {
        designerLeftStore.setActiveModule("layer-list");
        expect(designerLeftStore.activeModule).toBe("layer-list");

        designerLeftStore.closePanel(false);
        expect(designerLeftStore.panelOpen).toBe(false);
        expect(designerLeftStore.activeModule).toBe("layer-list");

        designerLeftStore.openPanel();
        expect(designerLeftStore.panelOpen).toBe(true);
        expect(designerLeftStore.activeModule).toBe("layer-list");
    });
});
