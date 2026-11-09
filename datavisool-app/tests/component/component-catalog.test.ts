/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, test, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    loader: {definitionMap: {} as Record<string, any>, remoteScriptMap: {} as Record<string, any>},
    index: {corpusVersion: "corpus-v1", documents: [] as any[]},
}));
vi.mock("@/designer/loader/DesignerLoader.ts", () => ({default: mocks.loader}));
vi.mock("@/designer/ai-driven/ComponentAiSelectionDocRegistry.ts", () => ({componentDocumentIndex: mocks.index}));

import {getLoadedComponentCatalogEntries, runGetComponentCatalogTool} from "@/frontend-effect/tools/GetComponentCatalogTool.ts";
import {assertComponentDocumentVersions, getLoadedComponentDocumentIdentity} from "@/frontend-effect/component-docs/ComponentDocumentVersions.ts";

function register(type: string, overrides = {}) {
    const documentInfo = {
        componentType: type, source: "builtin", componentVersion: "v1", corpusVersion: "corpus-v1",
        sha256: `hash-${type}`, documentFormatVersion: "v1", hasFullSpec: true,
        componentInfo: {componentType: type, componentName: type, description: "描述", nativeCapabilities: "能力", selectable: true},
        ...overrides,
    };
    mocks.index.documents.push(documentInfo);
    mocks.loader.definitionMap[type] = {getBaseInfo: () => ({
        compKey: type, compName: type, categorize: "基础", subCategorize: "文字", width: 300, height: 80,
    })};
    return documentInfo;
}

beforeEach(() => {
    mocks.loader.definitionMap = {};
    mocks.loader.remoteScriptMap = {};
    mocks.index.documents = [];
});

describe("完整组件选择目录", () => {
    test("一次返回全部可用组件，每项仅含类型、名称、描述", () => {
        for (let i = 0; i < 120; i++) register(`Type${i}`);
        const catalog = runGetComponentCatalogTool();
        expect(catalog.components).toHaveLength(120);
        expect(catalog.components.find(item => item.componentType === "Type119")).toEqual({
            componentType: "Type119", componentName: "Type119", description: "描述",
        });
        catalog.components.forEach(item => expect(Object.keys(item).sort()).toEqual([
            "componentName", "componentType", "description",
        ]));
        expect(JSON.stringify(catalog)).not.toMatch(/documentInfo|sha256|componentVersion|componentInfo/);
        expect(getLoadedComponentCatalogEntries()[0].documentInfo).toBeDefined();
    });

    test("继续过滤未开放、缺少完整规格及不可选的组件", () => {
        register("BaseText");
        register("G2PlotCustom");
        register("MissingSpec", {hasFullSpec: false});
        register("NotSelectable", {componentInfo: {selectable: false}});
        expect(runGetComponentCatalogTool().components.map(item => item.componentType)).toEqual(["BaseText"]);
    });

    test("远程组件身份仍按实际加载版本校验", () => {
        const builtin = register("BaseText");
        const remote = {...builtin, source: "remote", componentId: "42", componentVersion: "remote-v1", sha256: "remote-hash"};
        mocks.loader.remoteScriptMap.BaseText = {documentInfo: remote};
        expect(runGetComponentCatalogTool().components).toHaveLength(1);
        expect(getLoadedComponentDocumentIdentity("BaseText")).toMatchObject(remoteIdentity(remote));
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [remote]})).not.toThrow();
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [builtin]})).toThrow("版本不同");
    });
});

function remoteIdentity(info: Record<string, unknown>) {
    return {componentType: info.componentType, source: info.source, componentId: info.componentId,
        componentVersion: info.componentVersion, sha256: info.sha256};
}
