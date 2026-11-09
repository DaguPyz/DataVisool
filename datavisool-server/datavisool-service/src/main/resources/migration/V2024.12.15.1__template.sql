-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table template
(
    id            bigint auto_increment comment 'id' primary key,
    name          varchar(255)                        null comment '模板名称',
    template_json longtext                            null comment '模板json',
    thumbnail     varchar(255)                        null comment '模板缩略图',
    user_id       bigint                              not null comment '用户id',
    deleted       int                                 not null comment '是否删除',
    update_time   timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time   timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '模板库';