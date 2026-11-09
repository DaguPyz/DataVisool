/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test} from "vitest";
import {runGetComponentSnapshotsTool, SNAPSHOT_FIELDS} from "@/frontend-effect/tools/GetComponentSnapshotsTool.ts";

describe("组件快照工具契约", () => {
    afterEach(() => delete (window as any).DATAVISOOL_ENV);

    test("全部声明字段可读取，身份字段自动返回", () => {
        const layer = {id: "title", type: "BaseText", name: "标题", x: 0, y: 0, width: 600, height: 100};
        const config = {
            base: {type: "BaseText"}, style: {color: "#fff"},
            data: {sourceType: "static", staticData: {value: "大屏标题"}}, filter: {enable: false},
        };
        (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {
            layerConfigs: {title: layer}, controllers: {title: {getConfig: () => config}},
        }}};
        expect(runGetComponentSnapshotsTool({componentIds: ["title"], fields: [...SNAPSHOT_FIELDS]})).toEqual({
            components: [{id: "title", type: "BaseText", name: "标题", layer, config, ...config}],
            missingComponentIds: [],
        });
    });

    test.each(["id", "type", "name"])("复现错误字段%s，一次给出合法值和身份说明", (field) => {
        expect(() => runGetComponentSnapshotsTool({componentIds: ["title"], fields: [field]}))
            .toThrow(`仅允许 ${SNAPSHOT_FIELDS.join("、")}；id/type/name 自动返回`);
    });

    test("全页模式无需ID，默认50条并可根据offset继续", () => {
        const layerConfigs = Object.fromEntries(Array.from({length: 51}, (_, index) => [
            `title-${index}`, {id: `title-${index}`, type: "BaseText", order: index},
        ]));
        (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs}}};
        const first = runGetComponentSnapshotsTool({allPage: true, fields: ["layer"]});
        expect(first).toMatchObject({totalComponents: 51, offset: 0, hasMore: true});
        expect(first.components).toHaveLength(50);
        const last = runGetComponentSnapshotsTool({allPage: true, fields: ["layer"], offset: 50});
        expect(last).toMatchObject({totalComponents: 51, offset: 50, hasMore: false});
        expect(last.components.map(component => component.id)).toEqual(["title-50"]);
    });
});
