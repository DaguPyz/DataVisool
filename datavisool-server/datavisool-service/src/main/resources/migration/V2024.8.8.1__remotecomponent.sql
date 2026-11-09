-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table remote_component
(
    id             bigint auto_increment comment 'id'
        primary key,
    component_name varchar(255)                        null comment '组件名称',
    url            varchar(255)                        not null comment '组件服务器地址',
    deleted        int                                 not null comment '是否删除',
    update_time    timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time    timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '远程组件管理';