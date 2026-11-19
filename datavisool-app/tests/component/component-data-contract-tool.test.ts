/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import type {DesignerCatalog} from "@datavisool/sdk/plugin/contracts/designerCatalog";
import {runGetComponentDataContractTool} from "@/plugins/editor-ai/frontend-effect/tools/GetComponentDataContractTool.ts";

const identity = {
    componentType: "AntdBaseColumn", source: "remote", componentId: "42", componentVersion: "code-v1",
    corpusVersion: "corpus-v1", sha256: "hash", documentFormatVersion: "component-document/v1",
};
const catalog = {
    listComponents: () => [{
        key: "AntdBaseColumn",
        baseInfo: {compKey: "AntdBaseColumn", compName: "柱状图", categorize: "图表", subCategorize: "柱图", width: 600, height: 400},
        aiDocumentation: {...identity, hasFullSpec: true, componentInfo: {
            componentType: "AntdBaseColumn", componentName: "柱状图", description: "柱状图", nativeCapabilities: "", selectable: true,
        }},
        chartImage: null,
    }],
} as unknown as DesignerCatalog;

const session = (components: Array<{id: string; type: string; name: string; layer: Record<string, unknown>; config: Record<string, unknown>}>) => ({
    readComponents: (ids: readonly string[]) => ({
        components: ids.flatMap(id => components.filter(component => component.id === id)),
        missingComponentIds: ids.filter(id => !components.some(component => component.id === id)),
    }),
} as unknown as EditorAiEditingSession);

describe("组件数据契约工具", () => {
    test("returns public catalog document identity with current data and mappings", () => {
        const canvas = session([{
            id: "chart", type: "AntdBaseColumn", name: "销售额", layer: {id: "chart", type: "AntdBaseColumn", name: "销售额"},
            config: {base: {type: "AntdBaseColumn"}, style: {xField: "category", yField: "amount"},
                data: {sourceType: "static", staticData: {value: [{category: "A", amount: 10}]}, value: [{category: "A", amount: 10}]}},
        }]);

        const result = runGetComponentDataContractTool({componentIds: ["chart"], sourceType: "static"}, canvas, catalog);

        expect(result.sourceContract.branch).toBe("staticData");
        expect(result.components[0].documentIdentity).toEqual(identity);
        expect(result.components[0].fieldMapping).toEqual({xField: "category", yField: "amount"});
        expect(result.components[0].currentData).toMatchObject({valueExample: [{category: "A", amount: 10}]});
        expect(result.components[0]).not.toHaveProperty("dataFormatRequirements");
    });

    test("reports missing components and refuses to invent a document identity", () => {
        expect(runGetComponentDataContractTool({componentIds: ["missing"]}, session([]), catalog).missingComponentIds).toEqual(["missing"]);
        const unknown = session([{id: "existing", type: "Unknown", name: "未知", layer: {id: "existing", type: "Unknown"}, config: {}}]);
        expect(() => runGetComponentDataContractTool({componentIds: ["existing"]}, unknown, catalog)).toThrow("组件没有可用文档");
    });
});
