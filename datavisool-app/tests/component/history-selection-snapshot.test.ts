/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import HistoryOperator from "@/plugins/editor-canvas/history/HistoryOperator.ts";
import {OperateType} from "@/plugins/editor-canvas/history/OperateType.ts";

describe("history selection snapshots", () => {
    test("captures canonical IDs when the record enters history and keeps the snapshot stable", () => {
        let selectedIds = ["group-a"];
        const history = new HistoryOperator(() => selectedIds);
        history.put({actions: [{type: OperateType.DRAG, prev: [], next: []}]});
        selectedIds = ["child-a"];

        expect(history.backoff()?.actions[0].selectionIds).toEqual(["group-a"]);
    });
});
