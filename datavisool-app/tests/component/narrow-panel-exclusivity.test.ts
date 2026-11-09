/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from "vitest";

vi.mock("@/designer/loader/DesignerLoader.ts", () => ({default: {definitionMap: {}}}));
vi.mock("@/designer/right/status-list/StatusListStore.ts", () => ({default: {init: vi.fn()}}));

import designerLeftStore from "@/designer/left/DesignerLeftStore.ts";
import rightStore, {enforceNarrowPanelExclusivity} from "@/designer/right/RightStore.ts";

describe("narrow editor panel exclusivity", () => {
    afterEach(() => {
        designerLeftStore.closePanel(false);
        rightStore.setContentVisible(false, false);
    });

    test("keeps the panel opened most recently when the viewport becomes narrow", () => {
        designerLeftStore.setActiveModule("components");
        rightStore.setContentVisible(true, false);

        enforceNarrowPanelExclusivity(959);

        expect(designerLeftStore.panelOpen).toBe(false);
        expect(rightStore.panelOpen).toBe(true);
    });

    test("keeps the left panel when it was opened most recently", () => {
        rightStore.setContentVisible(true, false);
        designerLeftStore.openPanel();

        enforceNarrowPanelExclusivity(700);

        expect(designerLeftStore.panelOpen).toBe(true);
        expect(rightStore.panelOpen).toBe(false);
    });

    test("allows both panels to stay open at the wide-screen breakpoint", () => {
        designerLeftStore.openPanel();
        rightStore.setContentVisible(true, false);

        enforceNarrowPanelExclusivity(960);

        expect(designerLeftStore.panelOpen).toBe(true);
        expect(rightStore.panelOpen).toBe(true);
    });
});
