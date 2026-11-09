/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test} from "vitest";
import HistoryOperator from "@/designer/operate-provider/undo-redo/HistoryOperator.ts";
import {OperateType} from "@/designer/operate-provider/undo-redo/OperateType.ts";
import {setHistorySelectionProvider} from "@/designer/operate-provider/selection/SelectionHistoryContext.ts";

describe("history selection snapshots", () => {
    afterEach(() => setHistorySelectionProvider(() => []));

    test("captures canonical IDs when the record enters history and keeps the snapshot stable", () => {
        let selectedIds = ["group-a"];
        setHistorySelectionProvider(() => selectedIds);
        const history = new HistoryOperator();
        history.put({actions: [{type: OperateType.DRAG, prev: [], next: []}]});
        selectedIds = ["child-a"];

        expect(history.backoff()?.actions[0].selectionIds).toEqual(["group-a"]);
    });
});
