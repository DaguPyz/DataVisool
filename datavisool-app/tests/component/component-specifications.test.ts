/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, test, vi} from "vitest";
const mocks = vi.hoisted(() => ({catalog: vi.fn(), post: vi.fn()}));
vi.mock("@/frontend-effect/tools/GetComponentCatalogTool.ts", () => ({
    runGetComponentCatalogTool: mocks.catalog,
    getLoadedComponentCatalogEntries: () => mocks.catalog().components,
}));
vi.mock("@/util/AuthFetchUtil.ts", () => ({default: {postOrThrow: mocks.post}}));
import {runResolveComponentSpecsTool, runGetComponentDocumentTool, runSearchComponentDocumentsTool} from "@/frontend-effect/tools/ComponentDocumentationTools.ts";
import {assertComponentDocumentVersions} from "@/frontend-effect/component-docs/ComponentDocumentVersions.ts";

const info = {componentType: "BaseText", source: "builtin", componentVersion: "version", sha256: "hash"};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockReturnValue({components: [{componentType: "BaseText", documentInfo: info}]});
    mocks.post.mockResolvedValue({specs: [{componentType: "BaseText"}], corpusVersion: "version", commonFragments: {}});
});
describe("按需文档工具", () => {
    test("只转发当前加载组件身份，由后端读取规格；历史分页参数不裁剪完整规格", async () => {
        const result = await runResolveComponentSpecsTool({componentTypes: [" BaseText ", "BaseText"], intent: "create", page: 99});
        expect(result.specs).toHaveLength(1);
        expect(mocks.post).toHaveBeenCalledWith("/api/component-documents/resolve_component_specs", expect.objectContaining({
            componentTypes: ["BaseText"], page: 99, catalog: [expect.objectContaining(info)],
        }));
    });
    test.each([
        {componentTypes: [], intent: "create"}, {componentTypes: [1], intent: "create"},
        {componentTypes: Array.from({length: 11}, (_, i) => "T" + i), intent: "create"},
        {componentTypes: ["BaseText"], intent: "invalid"},
    ])("无效参数不会触发文件读取 %j", payload => {
        expect(() => runResolveComponentSpecsTool(payload)).toThrow();
        expect(mocks.post).not.toHaveBeenCalled();
    });
    test("错误代码保持不变，超限或缺失文档不会返回伪完整结果", async () => {
        mocks.post.mockResolvedValue({status: "error", code: "agent.component_specs.output_limit_exceeded", message: "缩小范围"});
        await expect(runResolveComponentSpecsTool({componentTypes: ["BaseText"], intent: "patch"}))
            .rejects.toMatchObject({code: "agent.component_specs.output_limit_exceeded"});
    });
    test("章节分页和正文搜索通过后端执行", async () => {
        await runGetComponentDocumentTool({componentType: "BaseText", section: "组件选择", lineCount: 5});
        expect(mocks.post).toHaveBeenCalledWith("/api/component-documents/get_component_document", expect.objectContaining({section: "组件选择"}));
        await runSearchComponentDocumentsTool({query: "fontSize", componentTypes: ["BaseText"]});
        expect(mocks.post).toHaveBeenLastCalledWith("/api/component-documents/search_component_documents", expect.objectContaining({query: "fontSize"}));
    });
    test("服务器组件使用实际加载版本，并覆盖模型提供的目录", async () => {
        const remote = {...info, source: "remote", componentId: "42", componentVersion: "old-version"};
        mocks.catalog.mockReturnValue({components: [{componentType: "BaseText", documentInfo: remote}]});
        await runResolveComponentSpecsTool({componentTypes: ["BaseText"], intent: "create", catalog: [{componentVersion: "forged"}]});
        expect(mocks.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({catalog: [expect.objectContaining(remote)]}));
    });
    test("写入前拒绝与加载代码不同的文档版本", () => {
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [info]})).not.toThrow();
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [{...info, componentVersion: "stale"}]})).toThrow("版本不同");
        expect(() => assertComponentDocumentVersions({componentDocumentIdentities: [{...info, source: "remote", componentId: "42"}]})).toThrow("版本不同");
    });
});
