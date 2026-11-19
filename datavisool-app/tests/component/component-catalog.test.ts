/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, test, vi} from "vitest";
import type {DesignerCatalog} from "@datavisool/sdk/plugin/contracts/designerCatalog";

const mocks = vi.hoisted(() => ({
    components: [] as Array<{key: string; baseInfo: any; aiDocumentation?: any}>,
}));

import {getLoadedComponentCatalogEntries, runGetComponentCatalogTool} from "@/plugins/editor-ai/frontend-effect/tools/GetComponentCatalogTool.ts";
import {assertComponentDocumentVersions, getLoadedComponentDocumentIdentity} from "@/plugins/editor-ai/frontend-effect/component-docs/ComponentDocumentVersions.ts";

function register(type: string, overrides = {}) {
    const documentInfo = {
        componentType: type, source: "builtin", componentVersion: "v1", corpusVersion: "corpus-v1",
        sha256: `hash-${type}`, documentFormatVersion: "v1", hasFullSpec: true,
        componentInfo: {componentType: type, componentName: type, description: "描述", nativeCapabilities: "能力", selectable: true},
        ...overrides,
    };
    mocks.components.push({key: type, baseInfo: {
        compKey: type, compName: type, categorize: "基础", subCategorize: "文字", width: 300, height: 80,
    }, aiDocumentation: documentInfo});
    return documentInfo;
}

const catalog = {
    listComponents: () => mocks.components,
} as unknown as DesignerCatalog;

beforeEach(() => {
    mocks.components = [];
});

describe("完整组件选择目录", () => {
    test("一次返回全部可用组件，每项仅含类型、名称、描述", () => {
        for (let i = 0; i < 120; i++) register(`Type${i}`);
        const result = runGetComponentCatalogTool(catalog);
        expect(result.components).toHaveLength(120);
        expect(result.components.find(item => item.componentType === "Type119")).toEqual({
            componentType: "Type119", componentName: "Type119", description: "描述",
        });
        result.components.forEach(item => expect(Object.keys(item).sort()).toEqual([
            "componentName", "componentType", "description",
        ]));
        expect(JSON.stringify(result)).not.toMatch(/documentInfo|sha256|componentVersion|componentInfo/);
        expect(getLoadedComponentCatalogEntries(catalog)[0].documentInfo).toBeDefined();
    });

    test("继续过滤未开放、缺少完整规格及不可选的组件", () => {
        register("BaseText");
        register("G2PlotCustom");
        register("MissingSpec", {hasFullSpec: false});
        register("NotSelectable", {componentInfo: {selectable: false}});
        expect(runGetComponentCatalogTool(catalog).components.map(item => item.componentType)).toEqual(["BaseText"]);
    });

    test("远程组件身份仍按实际加载版本校验", () => {
        const builtin = register("BaseText");
        const remote = {...builtin, source: "remote", componentId: "42", componentVersion: "remote-v1", sha256: "remote-hash"};
        mocks.components[0].aiDocumentation = remote;
        expect(runGetComponentCatalogTool(catalog).components).toHaveLength(1);
        expect(getLoadedComponentDocumentIdentity("BaseText", catalog)).toMatchObject(remoteIdentity(remote));
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [remote]}, catalog)).not.toThrow();
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [builtin]}, catalog)).toThrow("版本不同");
    });
});

function remoteIdentity(info: Record<string, unknown>) {
    return {componentType: info.componentType, source: info.source, componentId: info.componentId,
        componentVersion: info.componentVersion, sha256: info.sha256};
}
