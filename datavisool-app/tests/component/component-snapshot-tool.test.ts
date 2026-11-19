/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import {runGetComponentSnapshotsTool, SNAPSHOT_FIELDS} from "@/plugins/editor-ai/frontend-effect/tools/GetComponentSnapshotsTool.ts";

function makeSession(components: Array<{id: string; type?: string; name?: string; layer: Record<string, unknown>; config?: Record<string, unknown>}>) {
    return {
        readCanvas: () => ({sceneVersion: 1, scope: {rootId: "10", activeId: "10", nested: false, loopPath: []}, managerId: "10",
            width: 1920, height: 1080, components}) as any,
        readComponents: (ids: readonly string[]) => ({
            components: ids.flatMap(id => components.filter(component => component.id === id)),
            missingComponentIds: ids.filter(id => !components.some(component => component.id === id)),
        }),
    } as unknown as EditorAiEditingSession;
}

describe("组件快照工具契约", () => {
    test("returns declared fields and includes identity fields automatically", () => {
        const layer = {id: "title", type: "BaseText", name: "标题", x: 0, y: 0, width: 600, height: 100};
        const config = {
            base: {type: "BaseText"}, style: {color: "#fff"},
            data: {sourceType: "static", staticData: {value: "大屏标题"}}, filter: {enable: false},
        };
        const session = makeSession([{id: "title", type: "BaseText", name: "标题", layer, config}]);
        expect(runGetComponentSnapshotsTool({componentIds: ["title"], fields: [...SNAPSHOT_FIELDS]}, session)).toEqual({
            components: [{id: "title", type: "BaseText", name: "标题", layer, config, ...config}],
            missingComponentIds: [],
        });
    });

    test.each(["id", "type", "name"])("rejects reserved field %s with the allowed fields", (field) => {
        const session = makeSession([]);
        expect(() => runGetComponentSnapshotsTool({componentIds: ["title"], fields: [field]}, session))
            .toThrow(`仅允许 ${SNAPSHOT_FIELDS.join("、")}；id/type/name 自动返回`);
    });

    test("paginates the full page using the detached canvas snapshot", () => {
        const components = Array.from({length: 51}, (_, index) => ({id: `title-${index}`, type: "BaseText",
            layer: {id: `title-${index}`, type: "BaseText", order: index}, config: {}}));
        const session = makeSession(components);
        const first = runGetComponentSnapshotsTool({allPage: true, fields: ["layer"]}, session);
        expect(first).toMatchObject({totalComponents: 51, offset: 0, hasMore: true});
        expect(first.components).toHaveLength(50);
        const last = runGetComponentSnapshotsTool({allPage: true, fields: ["layer"], offset: 50}, session);
        expect(last).toMatchObject({totalComponents: 51, offset: 50, hasMore: false});
        expect(last.components.map(component => component.id)).toEqual(["title-50"]);
    });
});
