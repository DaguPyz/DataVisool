-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
-- AI 模型管理只保留厂商接入信息，具体模型型号由 AI 驱动控制台按次选择。
alter table ai_model
    drop column model_name;
