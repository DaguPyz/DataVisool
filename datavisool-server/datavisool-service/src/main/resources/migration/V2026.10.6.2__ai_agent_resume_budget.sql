-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
alter table ai_agent_run add column limits_json longtext null comment '本次运行的累计预算授权';
alter table ai_agent_run add column usage_json longtext null comment '包含前序运行的累计用量';
