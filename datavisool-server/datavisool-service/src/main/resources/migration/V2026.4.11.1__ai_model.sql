-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

create table ai_model
(
    id             bigint auto_increment comment 'id'
        primary key,
    name           varchar(255)                        not null comment '模型名称',
    provider       varchar(128)                        not null comment '提供商',
    model_name     varchar(255)                        not null comment '模型标识',
    base_url       varchar(512)                        null comment '接入地址',
    api_key        text                                null comment 'API Key',
    description    text                                null comment '模型描述',
    temperature    double                              not null default 0.7 comment '采样温度',
    max_tokens     bigint                              null comment '最大 token',
    enabled        int                                 not null default 1 comment '是否启用',
    is_default     int                                 not null default 0 comment '是否默认',
    deleted        int                                 not null default 0 comment '是否删除',
    update_time    timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time    timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment 'AI模型';

create index idx_ai_model_deleted_update_time
    on ai_model (deleted, is_default, enabled, update_time);
