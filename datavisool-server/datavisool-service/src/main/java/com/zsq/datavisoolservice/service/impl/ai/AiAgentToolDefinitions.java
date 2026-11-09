/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.model.chat.request.json.JsonArraySchema;
import dev.langchain4j.model.chat.request.json.JsonEnumSchema;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.request.json.JsonStringSchema;

import java.util.List;

/** 模型可见的工具契约；新增工具必须显式定义，不能退回无结构参数。 */
final class AiAgentToolDefinitions {
    static final List<String> SNAPSHOT_FIELDS = List.of("layer", "config", "base", "style", "data", "filter");
    private static final List<String> SOURCE_TYPES = List.of("static", "api", "database", "commonApi", "globalVariable", "webSocket", "mqtt");
    private static final String PATH = "项目内相对路径，禁止绝对路径、.. 和符号链接";
    private static final String REVISION = "最近一次 Workspace/产物工具回执中的 workspaceRevision，非负整数；冲突后读取最新文件再提交";

    private AiAgentToolDefinitions() {}

    static ToolSpecification specification(String name) {
        return ToolSpecification.builder().name(name).description(description(name))
                .parameters(parameters(name)).strict(false).build();
    }

    private static String description(String name) {
        return switch (name) {
            case "inspect_current_page", "get_component_snapshots" ->
                    "读取已有组件的指定配置分支；两工具参数相同。返回 components 和 missingComponentIds，id/type/name 自动返回，不应放入 fields。"
                    + "修改前读取对应 style/data/layer/filter；删除前读取 layer。全页查询另返 totalComponents/hasMore/offset。示例：{\"componentIds\":[\"真实组件ID\"],\"fields\":[\"layer\"]}。";
            case "get_component_catalog" ->
                    "类型不明确时一次读取全部可用组件；返回 catalogVersion 和 components，每项仅含 componentType/componentName/description。"
                    + "单个任务最多一次；已知类型可跳过目录，已掌握规格时无需重复读取规格。";
            case "resolve_component_specs" ->
                    "按需读取所选类型完整配置、数据要求、限制及示例；历史中已掌握规格时可跳过。返回 specs、commonFragments、corpusVersion。创建参考 example.config，修改参考 example.stylePatch/dataPatch。"
                    + "按完整 <g2plot-…> 标签查 commonFragments，提交具体值，禁止标签、函数及未声明字段。修改数据/字段映射还需 get_component_data_contract。";
            case "get_component_data_contract" ->
                    "修改已有组件数据或 xField/yField 等映射前读取；返回目标数据源结构、组件数据能力、当前样例和字段映射。sourceType 变化后重新读取，只写对应分支。";
            case "get_project_snapshot" ->
                    "读取画布尺寸和组件清单；无参数。返回 projectId/managerId/canvasSnapshot/revision/components/selection；components 只有身份、位置尺寸和层级，不含配置。";
            case "get_current_canvas_selection" ->
                    "读取当前真实选区；无参数。返回 mode（none/single/multiple）、targetIds、components（id/type/name/layer）、totalSelected/truncated；最多返回100个，过滤 group。";
            case "get_current_canvas_revision" ->
                    "只读取当前画布版本；无参数。返回字符串 revision、managerId、componentCount；此 revision 不是文件 workspaceRevision。";
            case "get_canvas_operation_status" ->
                    "查询已有前端操作，operationId 必须来自真实工具回执；返回 operationType/status/result/baseRevision/resultRevision。pending/prepared/applying 表示未完成，按最终结果判断效果。";
            case "get_component_document" ->
                    "按需分页读取指定组件原始文档；已掌握所需规格可直接创建/修改。返回 content/startLine/endLine/totalLines/hasMore/nextStartLine/availableSections/documentIdentity；章节名使用 availableSections 中的值。";
            case "search_component_documents" ->
                    "在组件文档中按需搜索已知配置问题，大小写不敏感的普通文本匹配；类型不明确时使用组件目录。返回 matches（组件类型、行号、片段）、totalMatches/scannedDocuments/scanLimited，scanLimited=true 表示未搜完。";
            case "create_canvas_components" ->
                    "提交已校验的组件文件并自动预览、等待用户确认后写入。仅传 path 和最近工具回执的 workspaceRevision；文件必须由 begin_canvas_artifact 以 toolName=create_canvas_components 创建，且内容为 {\"components\":[完整组件数组]}。"
                    + "文件必须处于 validated 状态；validate_canvas_artifact 或成功的 repair_artifact 会返回该状态。validated 只代表可提交，不代表已创建。冲突后读取文件最新修订再提交，禁止重新输出完整 JSON。"
                    + "返回 confirmed/layerCount/componentBindings（草稿id→真实id）/resultRevision；confirmed=false 表示未创建。成功回执已提供真实ID，无后续步骤即可完成，无需为取ID再读画布。";
            case "patch_canvas_components" ->
                    "提交已校验的组件补丁文件。仅传 path 和最近工具回执的 workspaceRevision；文件必须由 begin_canvas_artifact 以 toolName=patch_canvas_components 创建，且内容为 {\"patches\":[补丁数组]}。"
                    + "文件必须处于 validated 状态；validate_canvas_artifact 或成功的 repair_artifact 会返回该状态。validated 只代表可提交，不代表已修改。冲突后读取文件最新修订再提交，禁止重新输出完整 JSON。先读对应实时快照；规格按需读取，已从历史掌握可跳过。数据/映射还需目标数据契约，基线由系统注入。Web可执行style/data；layer/filter需要宿主审批票据，Web尚无签发路径，不得自造票据或反复请求确认。"
                    + "返回 applied/failed/baseRevision/resultRevision，必须检查 failed；仅修改任务授权目标。stylePatch 示例：{\"style\":{\"color\":\"#fff\"}}，具体字段以规格为准。";
            case "begin_canvas_artifact" ->
                    "开始分阶段生成一个画布工具产物；按 toolName 绑定最终提交工具并创建独立空文件。复杂 render_draft 页面按区域分别 begin，每区一个完整 components 文件，不把整页塞进单文件。返回 status=writing、path、workspaceRevision。之后分块调用 write_canvas_artifact；系统累计完整文本后整体格式化并写入产物文件。写完调用 validate_canvas_artifact；校验通过后才提交该区域。";
            case "write_canvas_artifact" ->
                    "向 begin_canvas_artifact 创建的产物追加一段非空 UTF-8 原始文本，每次传入最多8192字节。系统会累计所有文本，对完整内容整体格式化后写入文件；不要分别格式化文本块。传最近工具回执的 workspaceRevision；成功返回 status=writing 和最新 workspaceRevision。每次都使用最新回执版本，冲突后先 read_workspace_file 读取最新版本再继续。文件只写 JSON 参数体，不要包额外说明或 Markdown。";
            case "validate_canvas_artifact" ->
                    "先格式化并写回完整 staged JSON 文件，再从文件重读校验语法、结构及组件配置；错误位置和 errorContext 对应格式化后的文件。复杂页面先在首个 render 文件提交完整 layout 区域清单和当前 regionId，之后每个区域单独建立完整组件文件并独立校验/修复；分区组件仍须完整，不要求整个页面只用一个文件。传最近工具回执的 workspaceRevision。成功返回 status=validated/path/workspaceRevision/contentSha256；这仅表示该文件版本可以提交，不表示画布创建或修改成功。失败返回 repair_required 和错误位置/原因；repair_artifact 修补后系统会格式化完整结果、写回并自动重新读取校验，成功直接返回 validated。只有之后又用 write_canvas_artifact 或 Workspace 工具改过文件，才需要显式重新校验。版本冲突先读取最新文件和修订。";
            case "repair_artifact" ->
                    "局部修复校验失败回执中的临时产物。对 staged 产物，文件是格式化后的 JSON 参数体；传回执 path、最新 workspaceRevision 作为 expectedRevision，以及 1–64 个局部 edits。oldText 必须从当前文件或 errorContext 复制并在文件中精确匹配一次；不要依据最初未格式化的输出生成补丁。系统按顺序应用全部 edits，再格式化完整结果、写回并从文件重读校验：成功返回 status=validated，不会自动执行；仍失败返回 repair_required 和格式化后文件中的最新错误，继续局部修补。通过后仍须用对应画布工具传 path 和最新 expectedRevision 提交。旧历史中的 inline 产物仍可按其历史回执修复并遵循回执给出的恢复步骤。"
                    + "每项 oldText 必须在当前文件中精确匹配一次，newText 是替换内容，可为空；按顺序原子应用。"
                    + "根据最新回执中的错误和 errorContext 修补；片段不足、匹配失败或修订冲突时 read_workspace_file 读取必要范围，配置问题可按需读取组件规格；禁止重新输出整份产物。"
                    + "成功后使用 repair_artifact 回执中的 validated 状态及最新 workspaceRevision 提交；若随后经 write_canvas_artifact 或 Workspace 工具改动文件，先显式调用 validate_canvas_artifact。";
            case "delete_canvas_components" ->
                    "删除已有组件需先读layer基线并取得宿主审批票据；Web尚无票据签发路径，当前不可执行，不得自造票据。宿主支持时返回 deletedComponentIds/failed/baseRevision/resultRevision，必须检查 failed。";
            case "render_draft" ->
                    "页面较复杂时先规划完整区域布局，再逐区域独立生成完整组件文件。用 begin_canvas_artifact(toolName=render_draft) 创建每个区域的独立文件，文件 JSON 含 components 数组；首个区域还必须含 regionId、完整 layout、incremental=false、interactive=false，后续区域含 regionId、首次渲染返回的 draftId、incremental=true、interactive=false。区域文件分别写入、校验和修复；interactive=false 保证逐区渲染不要求用户确认。普通单次 render 的文件可只含 components，但仍须经 staged 文件写入、校验和提交。每个文件校验通过后仅提交 action=render/path/expectedRevision；文件选项不会被提交参数覆盖。全部区域完成后只调用一次 action=preview/draftId/expectedDraftRevision 做总预览并等待用户确认；preview 不传 path 或 components。render 返回的 draftId/revision 只表示当前草稿状态，不表示正式画布已创建；只有最终预览确认后才完成。模型不能直接 accept。action=clear 时只传 action=clear。";
            case "confirm_canvas_patch" ->
                    "仅展示风险补丁确认并返回 confirmed，不执行修改、不签发审批票据，不能解锁Web中的layer/filter/删除操作；普通style/data修改无需此工具。";
            case "discard_canvas_draft" -> "清空当前临时草稿；无参数。返回 status=draft-cleared、layerCount=0，不删除正式组件。";
            case "request_component_selection" ->
                    "仅在需要用户决定组件类型时展示候选；类型必须来自完整目录。返回 confirmed/selectedComponentTypes，取消为 confirmed=false；选定后规格按需读取。";
            case "request_user_input" ->
                    "继续执行缺少用户选择/信息时提出结构化问题，等待回答后继续。每题2–3个建议选项，界面自动追加其他文本输入。回答为 answers[id].answers 字符串数组，取消不能视为确认。";
            case "update_plan" ->
                    "可选进度展示，不是结束前提。提交完整步骤列表，最多一个 in_progress；返回保存的 plan。completionRequirements 可省略，已声明的效果仍按真实回执验证，省略时保留已有要求。";
            case "push_progress_log" -> "向用户报告进度，不修改画布；返回保存的 message。";
            case "list_workspace_files" ->
                    "分页列出项目文件；返回 entries（path/entryType/byteSize/modifiedRevision）、workspaceRevision/totalEntries/hasMore/nextOffset。";
            case "search_workspace_files" ->
                    "搜索项目文件路径和 UTF-8 内容，返回 matches/workspaceRevision/hasMore/truncated/truncationReason；query 为空无效。";
            case "read_workspace_file" ->
                    "按包含首尾的行号读取 UTF-8 文本，最多400行；返回 excerpt（content/startLine/endLine/totalLines/contentSha256/modifiedRevision/workspaceRevision）、hasMore/nextStartLine。";
            case "apply_workspace_patch" ->
                    "一次事务应用文件补丁，返回新 workspaceRevision 和变更清单。格式为 *** Begin Patch、*** Add File: 相对路径（内容每行以+开头）或 *** Update File: 路径（@@块）或 *** Delete File: 路径、*** End Patch；更新文件移动使用 *** Move to: 路径。";
            case "move_workspace_path" -> "事务移动/重命名文件或目录树；返回新 workspaceRevision 和变更清单，目标不能覆盖已有路径。";
            case "delete_workspace_path" -> "事务删除文件或目录树；返回新 workspaceRevision 和变更清单。";
            default -> throw new IllegalArgumentException("缺少工具说明：" + name);
        };
    }

    private static JsonObjectSchema parameters(String name) {
        return switch (name) {
            case "inspect_current_page", "get_component_snapshots" -> object()
                    .addProperty("componentIds", strings("allPage=false（默认）时必填非空真实ID数组；自动去重"))
                    .addProperty("fields", enums("必填非空数组；layer为图层，config为完整配置，其余为配置同名分支；身份id/type/name自动返回", SNAPSHOT_FIELDS))
                    .addBooleanProperty("allPage", "默认false；true按图层顺序分页读取全页并忽略componentIds")
                    .addIntegerProperty("offset", "仅allPage=true生效；默认0，非负整数")
                    .addIntegerProperty("limit", "仅allPage=true生效；默认50，1–100整数")
                    .required("fields").build();
            case "resolve_component_specs" -> object()
                    .addProperty("componentTypes", strings("明确的类型字符串，去重后1–10个"))
                    .addEnumProperty("intent", List.of("create", "patch"), "本次创建或修改")
                    .required("componentTypes", "intent").build();
            case "get_component_data_contract" -> object()
                    .addProperty("componentIds", strings("已有组件真实ID，去重后1–4个"))
                    .addEnumProperty("sourceType", SOURCE_TYPES, "目标数据源，默认static；与随后dataPatch.sourceType一致")
                    .required("componentIds").build();
            case "get_canvas_operation_status" -> object().addStringProperty("operationId", "真实回执中的操作ID")
                    .required("operationId").build();
            case "get_component_document" -> object()
                    .addStringProperty("componentType", "明确的组件类型")
                    .addStringProperty("section", "可选精确章节名，先从availableSections取得；省略读取整份文档")
                    .addIntegerProperty("startLine", "文档绝对行号，从1开始；默认所选章节首行")
                    .addIntegerProperty("lineCount", "默认40；截取1–80行")
                    .required("componentType").build();
            case "search_component_documents" -> object()
                    .addStringProperty("query", "非空普通文本")
                    .addProperty("componentTypes", strings("限制搜索类型；省略/空数组搜索可用文档"))
                    .addIntegerProperty("maxResults", "默认50，1–100；最多扫描20份文档")
                    .required("query").build();
            case "create_canvas_components", "patch_canvas_components" -> object()
                    .addStringProperty("path", PATH + "；由对应 toolName 的 begin_canvas_artifact 回执返回")
                    .addIntegerProperty("expectedRevision", "同一路径最近一次工具回执的 workspaceRevision")
                    .required("path", "expectedRevision").build();
            case "begin_canvas_artifact" -> object()
                    .addEnumProperty("toolName", List.of("create_canvas_components", "patch_canvas_components", "render_draft"),
                            "最终提交的画布工具；后续提交工具名必须匹配")
                    .required("toolName").build();
            case "write_canvas_artifact" -> object()
                    .addStringProperty("path", PATH + "；begin_canvas_artifact 回执返回的路径")
                    .addIntegerProperty("expectedRevision", REVISION)
                    .addStringProperty("content", "非空 UTF-8 原始文本块，每次最多8192字节。系统累计文本并格式化完整内容后写入文件；不要分别格式化文本块或加入 Markdown 围栏")
                    .required("path", "expectedRevision", "content").build();
            case "validate_canvas_artifact" -> object()
                    .addStringProperty("path", PATH + "；begin_canvas_artifact 回执返回的路径")
                    .addIntegerProperty("expectedRevision", REVISION)
                    .required("path", "expectedRevision").build();
            case "repair_artifact" -> object()
                    .addStringProperty("path", "校验失败回执返回的临时产物相对路径")
                    .addIntegerProperty("expectedRevision", REVISION)
                    .addProperty("edits", JsonArraySchema.builder().description("1–64 个局部文本替换，按顺序应用")
                            .items(object().addStringProperty("oldText", "当前文件中唯一的非空待替换片段")
                                    .addStringProperty("newText", "替换内容；删除片段时为空字符串")
                                    .required("oldText", "newText").build()).build())
                    .required("path", "expectedRevision", "edits").build();
            case "delete_canvas_components" -> object()
                    .addProperty("targets", JsonArraySchema.builder().description("非空目标数组，不能传字符串ID数组")
                            .items(object().addStringProperty("componentId", "真实组件ID")
                                    .addStringProperty("componentType", "快照中的type")
                                    .required("componentId", "componentType").build()).build())
                    .required("targets").build();
            case "render_draft" -> object()
                    .addEnumProperty("action", List.of("render", "preview", "clear"), "render提交一个已校验的区域文件，需path和expectedRevision；preview提交完整草稿总预览，只需draftId和expectedDraftRevision且不得传文件；clear只传action")
                    .addStringProperty("path", PATH + "；仅render时由 toolName=render_draft 的 begin_canvas_artifact 回执返回")
                    .addIntegerProperty("expectedRevision", "仅render时使用文件最近工具回执的 workspaceRevision")
                    .addStringProperty("draftId", "仅preview时传最近一次 render 实际回执返回的草稿ID；分区后续文件也写入该ID")
                    .addIntegerProperty("expectedDraftRevision", "仅preview时传最后一个区域 render 实际回执返回的草稿 revision")
                    .required("action").build();
            case "confirm_canvas_patch" -> object()
                    .addEnumProperty("risk", List.of("r2", "r3"), "确认风险等级")
                    .addProperty("patches", patches(false)).required("risk", "patches").build();
            case "request_component_selection" -> object()
                    .addStringProperty("message", "非空选择说明")
                    .addProperty("candidates", JsonArraySchema.builder().description("1–30个不重复类型的候选")
                            .items(object().addStringProperty("componentType", "目录中的明确类型")
                                    .addStringProperty("displayName", "非空显示名")
                                    .addStringProperty("description", "候选说明")
                                    .addBooleanProperty("defaultSelected", "默认false；系统会补齐minSelected个初始选项")
                                    .required("componentType", "displayName").build()).build())
                    .addIntegerProperty("minSelected", "默认1，0–候选数，不能大于maxSelected")
                    .addIntegerProperty("maxSelected", "默认候选数，1–候选数，默认选中数量不能超过此值")
                    .required("message", "candidates").build();
            case "request_user_input" -> object()
                    .addProperty("questions", JsonArraySchema.builder().description("1–3题；id唯一")
                            .items(object().addStringProperty("id", "非空稳定问题ID，对应回答键")
                                    .addStringProperty("header", "非空简短标题")
                                    .addStringProperty("question", "非空完整问题")
                                    .addProperty("options", JsonArraySchema.builder().description("2–3个建议选项，label不重复；不自行添加其他选项")
                                            .items(object().addStringProperty("label", "非空选项名")
                                                    .addStringProperty("description", "非空选项说明")
                                                    .required("label", "description").build()).build())
                                    .required("id", "header", "question", "options").build()).build())
                    .required("questions").build();
            case "push_progress_log" -> object().addStringProperty("message", "非空自然语言进度说明").required("message").build();
            case "update_plan" -> object().addStringProperty("explanation", "进度变化说明")
                    .addProperty("plan", JsonArraySchema.builder().description("1–20个步骤，step为1–200字符；最多一个in_progress")
                            .items(object().addStringProperty("step", "步骤说明")
                                    .addEnumProperty("status", List.of("pending", "in_progress", "completed"), "步骤状态")
                                    .required("step", "status").build()).build())
                    .addProperty("completionRequirements", object().description("可选；省略保留已声明要求")
                            .addProperty("requiredCanvasEffects", enums("最多3项，可为空", List.of("createComponents", "patchComponents", "deleteComponents")))
                            .required("requiredCanvasEffects").build())
                    .required("plan").build();
            case "list_workspace_files" -> object().addStringProperty("path", PATH + "；默认空字符串为根目录")
                    .addIntegerProperty("depth", "默认3，1–32")
                    .addIntegerProperty("offset", "默认0，非负整数")
                    .addIntegerProperty("limit", "默认100，1–200")
                    .build();
            case "search_workspace_files" -> object().addStringProperty("query", "非空文本或正则，最多1024字符")
                    .addStringProperty("path", PATH + "；默认根目录")
                    .addEnumProperty("mode", List.of("literal", "regex"), "默认literal普通文本；regex正则")
                    .addEnumProperty("caseMode", List.of("sensitive", "insensitive", "smart"), "默认sensitive；smart在query无大写字母时忽略大小写")
                    .addProperty("globs", strings("可选文件Glob列表，最多20个"))
                    .addBooleanProperty("includeHidden", "默认false")
                    .addBooleanProperty("respectIgnoreFiles", "默认true，遵循忽略文件")
                    .addIntegerProperty("maxResults", "默认50，1–100；0也使用默认值")
                    .required("query").build();
            case "read_workspace_file" -> object().addStringProperty("path", PATH + "；必须为文本文件")
                    .addIntegerProperty("startLine", "默认1，正整数")
                    .addIntegerProperty("endLine", "默认160，不小于startLine；包含首尾，最多400行")
                    .required("path").build();
            case "apply_workspace_patch" -> object().addIntegerProperty("expectedRevision", REVISION)
                    .addStringProperty("patch", "完整补丁文本；最多64个文件操作、512KiB")
                    .required("expectedRevision", "patch").build();
            case "move_workspace_path" -> object().addStringProperty("from", PATH + "；已有源路径")
                    .addStringProperty("to", PATH + "；新目标路径")
                    .addIntegerProperty("expectedRevision", REVISION).required("from", "to", "expectedRevision").build();
            case "delete_workspace_path" -> object().addStringProperty("path", PATH + "；已有文件或目录")
                    .addIntegerProperty("expectedRevision", REVISION).required("path", "expectedRevision").build();
            case "get_component_catalog", "get_project_snapshot", "get_current_canvas_selection", "get_current_canvas_revision", "discard_canvas_draft" -> object().build();
            default -> throw new IllegalArgumentException("缺少工具参数定义：" + name);
        };
    }

    private static JsonArraySchema patches(boolean requireType) {
        var patch = object().description("stylePatch/dataPatch/layerPatch/filterPatch至少一个非空")
                .addStringProperty("componentId", "已有组件真实ID")
                .addStringProperty("componentType", "快照中的type")
                .addProperty("stylePatch", object().description("外层必须含style，不能平铺样式字段")
                        .addProperty("style", freeObject("非空样式补丁，具体字段以patch规格为准；深合并"))
                        .required("style").build())
                .addProperty("dataPatch", freeObject("非空数据补丁；sourceType及对应源分支必须按get_component_data_contract返回结构填写"))
                .addProperty("layerPatch", object().description("宿主审批票据必需，Web尚不可执行；支持时为非空位置尺寸或名称补丁")
                        .addNumberProperty("x", "有限数且>=0").addNumberProperty("y", "有限数且>=0")
                        .addNumberProperty("width", "有限数且>0").addNumberProperty("height", "有限数且>0")
                        .addStringProperty("name", "1–200字符").build())
                .addProperty("filterPatch", object().description("宿主审批票据必需，Web尚不可执行；支持时为非空滤镜补丁")
                        .addBooleanProperty("enable", "是否启用")
                        .addNumberProperty("blur", "0–100").addNumberProperty("brightness", "0–10")
                        .addNumberProperty("contrast", "0–10").addNumberProperty("opacity", "0–1")
                        .addNumberProperty("saturate", "0–10").addNumberProperty("hueRotate", "-360–360").build())
                .addStringProperty("reason", "可选修改说明");
        patch.required(requireType ? List.of("componentId", "componentType") : List.of("componentId"));
        return JsonArraySchema.builder().description("非空补丁数组").items(patch.build()).build();
    }

    private static JsonObjectSchema.Builder object() {
        return JsonObjectSchema.builder().additionalProperties(false);
    }

    private static JsonObjectSchema freeObject(String description) {
        return JsonObjectSchema.builder().description(description).additionalProperties(true).build();
    }

    private static JsonArraySchema strings(String description) {
        return JsonArraySchema.builder().description(description).items(JsonStringSchema.builder().build()).build();
    }

    private static JsonArraySchema enums(String description, List<String> values) {
        return JsonArraySchema.builder().description(description)
                .items(JsonEnumSchema.builder().enumValues(values).build()).build();
    }
}
