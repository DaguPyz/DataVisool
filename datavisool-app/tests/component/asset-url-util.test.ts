/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test} from "vitest";
import AssetUrlUtil from "@/util/AssetUrlUtil.ts";

describe("AssetUrlUtil", () => {
    const initialUrl = window.location.href;

    afterEach(() => {
        window.history.replaceState({}, "", initialUrl);
    });

    test("does not rewrite a legacy release static path", () => {
        window.history.replaceState({}, "", "/release/123");

        expect(AssetUrlUtil.toLoadableUrl("static/components/remote-button.js"))
            .toBe("static/components/remote-button.js");
    });

    test("keeps absolute static and external URLs intact", () => {
        expect(AssetUrlUtil.toLoadableUrl("/static/components/remote-button.js"))
            .toBe(`${window.location.origin}/static/components/remote-button.js`);
        expect(AssetUrlUtil.toLoadableUrl("https://cdn.example.com/remote-button.js"))
            .toBe("https://cdn.example.com/remote-button.js");
    });
});
