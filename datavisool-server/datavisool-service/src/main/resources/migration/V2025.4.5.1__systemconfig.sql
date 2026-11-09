-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table system_config
(
    id          bigint auto_increment comment 'id' primary key,
    name        varchar(255)                        not null comment '配置项名称',
    value       varchar(255)                        not null comment '配置项值',
    des         varchar(255)                        null comment '配置项描述信息',
    deleted     int       default 0                 not null comment '是否删除',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '系统配置项';

alter table file
    drop column project_id;
