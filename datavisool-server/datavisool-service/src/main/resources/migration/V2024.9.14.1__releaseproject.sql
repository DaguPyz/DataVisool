-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
drop table if exists project_release;

create table project_release
(
    id              bigint auto_increment comment 'id'
        primary key,
    name            varchar(255)                        null comment '发布项目名称',
    state           int                                 not null comment '发布状态',
    encrypt         bit(1)                              not null default 0 comment '是否加密',
    password        varchar(255)                        null comment '密码',
    data_json       longtext                            null comment '数据json',
    project_id      bigint                              not null comment '项目id',
    expiration_date int                                 null comment '过期时间(不设置为永久有效)',
    deleted         int                                 not null comment '是否删除',
    update_time     timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time     timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '项目发布管理';