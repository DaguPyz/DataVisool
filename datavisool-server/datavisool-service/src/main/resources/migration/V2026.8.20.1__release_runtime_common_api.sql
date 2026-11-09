-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table if not exists project_release_runtime_common_api
(
    id            bigint auto_increment comment 'id'
        primary key,
    release_id    bigint                              not null comment '发布项目id',
    common_api_id bigint                              not null comment '公共API id',
    name          varchar(255)                        null comment '发布时固化的公共API名称',
    url           text                                null comment '发布时固化的请求地址',
    method        varchar(32)                         null comment '发布时固化的请求方式',
    params        text                                null comment '发布时固化的请求参数',
    headers       text                                null comment '发布时固化的请求头',
    source_path   varchar(1024)                       null comment '公共API数据源在发布JSON中的路径',
    create_time   timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    unique key uk_release_runtime_common_api (release_id, common_api_id),
    key idx_release_runtime_common_api_release (release_id),
    key idx_release_runtime_common_api_common_api (common_api_id)
)
    comment '发布项目运行态公共API快照';
