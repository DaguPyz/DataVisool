/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export interface IAiDrivenToolPresentation {
    title: string;
    detail: string;
}

const TOOL_PRESENTATIONS: Record<string, IAiDrivenToolPresentation> = {
    update_plan: {title: "更新任务计划", detail: "调整后续执行步骤"},
    inspect_current_page: {title: "读取当前页面", detail: "了解画布结构和现有内容"},
    get_project_snapshot: {title: "读取项目快照", detail: "了解画布中的组件与当前配置"},
    get_component_snapshots: {title: "读取组件快照", detail: "确认目标组件的当前状态"},
    get_component_catalog: {title: "读取组件目录", detail: "确认可用组件与类型信息"},
    get_current_canvas_revision: {title: "读取画布版本", detail: "确认当前画布的最新状态"},
    get_component_document: {title: "读取组件说明", detail: "确认组件能力和配置方式"},
    search_available_components: {title: "查找可用组件", detail: "匹配当前需求所需组件"},
    get_component_data_contract: {title: "读取数据说明书", detail: "确认数据源结构与组件数据格式"},
    create_canvas_components: {title: "创建画布组件", detail: "预览确认后写入真实画布"},
    patch_canvas_components: {title: "修改画布组件", detail: "校验快照后原子更新真实画布"},
    delete_canvas_components: {title: "删除画布组件", detail: "确认并校验快照后删除真实画布组件"},
    get_current_canvas_selection: {title: "读取当前选区", detail: "获取调用时刻的真实画布选区"},
    get_canvas_operation_status: {title: "查询画布动作", detail: "校准尚未确认的动作结果"},
    request_component_selection: {title: "等待组件选择", detail: "需要选择本次使用的组件"},
    request_user_input: {title: "等待补充信息", detail: "需要更多信息后继续"},
    ask_user: {title: "等待补充信息", detail: "需要更多信息后继续"},
    list_workspace_files: {title: "查看工作区文件", detail: "了解已有草稿和文档"},
    search_workspace_files: {title: "搜索工作区文件", detail: "查找相关内容"},
    search_component_documents: {title: "搜索组件说明", detail: "查找组件能力与配置规则"},
    read_workspace_file: {title: "读取工作区文件", detail: "检查文件内容"},
    apply_workspace_patch: {title: "修改工作区文件", detail: "写入文件变更"},
    move_workspace_path: {title: "移动工作区路径", detail: "移动或重命名文件与目录"},
    delete_workspace_path: {title: "删除工作区路径", detail: "删除文件或目录"},
    apply_patch: {title: "修改工作区文件", detail: "写入文件变更"},
    report_progress: {title: "更新任务状态", detail: "同步当前执行进度"},
    push_progress_log: {title: "更新任务状态", detail: "同步当前执行进度"},
};

const toolNamePattern = new RegExp(`\\b(${Object.keys(TOOL_PRESENTATIONS).join("|")})\\b`, "g");

export const getAiDrivenToolPresentation = (toolName: string): IAiDrivenToolPresentation => {
    return TOOL_PRESENTATIONS[toolName] ?? {
        title: "执行任务步骤",
        detail: "Agent 正在处理当前任务",
    };
};

/** 过程文字偶尔混入内部方法名时，统一改为用户可读的动作名称。 */
export const humanizeAiDrivenToolNames = (text: string) =>
    text.replace(toolNamePattern, (toolName) => getAiDrivenToolPresentation(toolName).title);

export const hiddenLiveToolNames = new Set(["report_progress", "update_plan"]);
