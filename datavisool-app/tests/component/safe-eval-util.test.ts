/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from "vitest";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";

describe("SafeEvalUtil", () => {
    it("returns an already evaluated function when functions are allowed", () => {
        const render = function renderG2Plot() {
            return "ok";
        };

        expect(SafeEvalUtil.run(render)).toBe(render);
    });

    it("keeps rejecting direct functions when functions are not allowed", () => {
        const render = function renderG2Plot() {
            return "ok";
        };

        expect(SafeEvalUtil.run(render, {allowTypes: ["object"]})).toBeNull();
    });

    it("evaluates function source strings", () => {
        const result = SafeEvalUtil.run<() => string>("function renderG2Plot() { return 'ok'; }");

        expect(typeof result).toBe("function");
        expect(result?.()).toBe("ok");
    });
});
