-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table if not exists project_release_runtime_datasource
(
    id                     bigint auto_increment comment 'id'
        primary key,
    release_id             bigint                              not null comment '发布项目id',
    runtime_data_source_id varchar(128)                        not null comment '发布态运行数据源id',
    target_db              bigint                              not null comment '数据库数据源id',
    sql_template           text                                not null comment '发布时固化的SQL模板',
    variable_keys          text                                null comment 'SQL模板中使用的全局变量key列表(JSON)',
    source_path            varchar(1024)                       null comment '数据源在发布JSON中的路径',
    create_time            timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    unique key uk_release_runtime_datasource (release_id, runtime_data_source_id),
    key idx_release_runtime_datasource_release (release_id),
    key idx_release_runtime_datasource_runtime_id (runtime_data_source_id),
    key idx_release_runtime_datasource_target_db (target_db)
)
    comment '发布项目运行态数据源';

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
