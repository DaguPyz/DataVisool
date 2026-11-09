/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, it, vi} from "vitest";

const {warning, success, error, request} = vi.hoisted(() => ({warning: vi.fn(), success: vi.fn(), error: vi.fn(), request: vi.fn()}));
vi.mock("@datavisool/ui", () => ({
    globalModal: {modalApi: {warning}},
    globalMessage: {messageApi: {success, error}},
}));
vi.mock("@/util/AuthTools.ts", () => ({default: {removeUser: vi.fn(), getToken: () => "test-token"}}));
vi.mock("axios", () => ({default: Object.assign(request, {isCancel: () => false})}));

import responseHandler from "@/api/ReponseHandler.ts";
import AuthFetchUtil from "@/util/AuthFetchUtil.ts";
import {showProjectImportSuccess} from "@/util/ProjectImportResult.ts";

describe("project import notices", () => {
    beforeEach(() => vi.clearAllMocks());

    it("shows the successful import's missing datasource notice before reload", () => {
        const notice = "项目已导入，但项目包缺少 1 处公共 API 的配置，请重新选择数据源。";
        let importNotice = "";
        const result = responseHandler({code: 200, msg: notice, data: true}, {
            onSuccess: response => { if (response.msg !== "操作成功") importNotice = response.msg || ""; },
        });
        if (result === true) showProjectImportSuccess(importNotice);
        expect(warning).toHaveBeenCalledWith(expect.objectContaining({
            content: notice, closable: false, maskClosable: false, keyboard: false,
        }));
        expect(success).not.toHaveBeenCalled();
    });

    it("shows missing asset locations in the import notice", () => {
        const notice = "项目已导入，但有 1 处本地资源未能关联到项目包，原地址已保留，请检查：项目 42：BaseImage（Logo）.style.localUrl。";
        showProjectImportSuccess(notice);
        expect(warning).toHaveBeenCalledWith(expect.objectContaining({content: notice}));
        expect(success).not.toHaveBeenCalled();
    });

    it("does not report a failed import as success", () => {
        const onSuccess = vi.fn();
        expect(responseHandler({code: 500, msg: "导入失败", data: null}, {onSuccess})).toBeNull();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith("导入失败");
    });

    it("passes the import notice through the authenticated multipart request", async () => {
        const notice = "请重新选择数据源";
        request.mockResolvedValue({headers: {"content-type": "application/json"},
            data: {text: async () => JSON.stringify({code: 200, msg: notice, data: true})}});
        const onSuccess = vi.fn();
        const result = await AuthFetchUtil.post<boolean>("/api/import/importProject", new FormData(), {
            headers: {"Content-Type": "multipart/form-data"}, onSuccess,
        });
        expect(result).toBe(true);
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({msg: notice}));
        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            url: "/api/import/importProject", headers: expect.objectContaining({Authorization: "Bearer test-token"}),
        }));
    });

    it("shows the component name and conversion reason returned by the import endpoint", async () => {
        const message = "导入失败：组件「销售图表」无法转换：组件 chart.js 无法转换: 旧组件使用了 FetchUtil";
        request.mockResolvedValue({headers: {"content-type": "application/json"},
            data: {text: async () => JSON.stringify({code: 10001, msg: message, data: null})}});
        const onSuccess = vi.fn();
        const result = await AuthFetchUtil.post<boolean>("/api/import/importProject", new FormData(), {
            headers: {"Content-Type": "multipart/form-data"}, onSuccess,
        });
        expect(result).toBeNull();
        expect(error).toHaveBeenCalledWith(message);
        expect(onSuccess).not.toHaveBeenCalled();
        expect(success).not.toHaveBeenCalled();
    });
});
