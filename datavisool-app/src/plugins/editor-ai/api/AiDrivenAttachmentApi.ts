/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";

export interface IAiDrivenAttachmentUploadPayload {
    /** 附件归属的项目 id。 */
    projectId: string;
    /** AI驱动会话 id，用于限制附件在当前会话内复用。 */
    sessionId: string;
    /** 上传动作 id，用于排查一次上传产生的附件链路。 */
    uploadRequestId?: string;
    /** 原始文件名，用于记录审计信息和辅助识别图片后缀。 */
    fileName: string;
    /** 图片文件内容，必须是 base64 data URL。 */
    dataUrl: string;
    /** 前端识别到的 MIME 类型，data URL 未携带时作为回退值。 */
    mime?: string;
    /** 可选过期时间戳，单位为毫秒；未传时由后端使用默认过期时间。 */
    expireAt?: number;
}

export interface IAiDrivenAttachmentReference {
    /** 附件主键，也是后续 AI 请求引用该附件的 attachmentId。 */
    attachmentId: string;
    /** 附件主键，兼容通用 id 读取场景。 */
    id: string;
    /** 附件归属的项目 id。 */
    projectId: string;
    /** 附件归属的 AI驱动会话 id。 */
    sessionId: string;
    /** 上传动作 id。 */
    uploadRequestId: string;
    /** 后端校验并归一化后的 MIME 类型。 */
    mimeType: string;
    /** 用户上传时的原始文件名。 */
    originalName: string;
    /** 文件内容 SHA-256 哈希。 */
    sha256: string;
    /** 文件在资源存储根目录下的相对路径。 */
    relativePath: string;
    /** 前端可读取的本地 asset URL。 */
    url: string;
    /** 原始文件字节大小。 */
    byteSize: number;
    /** 能识别时返回图片宽度。 */
    width?: number | null;
    /** 能识别时返回图片高度。 */
    height?: number | null;
    /** 附件状态；提交任务认领前为 temporary。 */
    status: "temporary";
    /** 附件过期时间戳，单位为毫秒。 */
    expireAt: number;
    /** 附件创建时间戳，单位为毫秒。 */
    createdAt: number;
    /** 附件更新时间戳，单位为毫秒。 */
    updatedAt: number;
}

/**
 * 上传 AI驱动图片附件，并返回后续 AI 请求可引用的附件信息。
 */
export const uploadAiDrivenImageAttachment = async (
    payload: IAiDrivenAttachmentUploadPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenAttachmentReference | null> => {
    return await AuthFetchUtil.post<IAiDrivenAttachmentReference>(
        "/api/aiDriven/attachment/upload",
        payload,
        options,
    );
};
