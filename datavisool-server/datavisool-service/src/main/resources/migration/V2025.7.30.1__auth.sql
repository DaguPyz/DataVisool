-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

create table auth_permission
(
    id          int auto_increment comment '权限ID'
        primary key,
    name        varchar(50)                         not null comment '权限名称',
    description varchar(255)                        null comment '权限描述',
    deleted     int       default 0                 not null comment '是否删除',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间'
);

create table auth_role
(
    id          int auto_increment comment '角色ID'
        primary key,
    name        varchar(50)                         not null comment '角色名称',
    description varchar(255)                        null comment '角色描述',
    deleted     int       default 0                 not null comment '是否删除',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间'
);

create table auth_role_permission
(
    id            int auto_increment comment '角色权限ID'
        primary key,
    role_id       int                                 not null comment '角色ID',
    permission_id int                                 not null comment '权限ID',
    deleted       int       default 0                 not null comment '是否删除',
    create_time   timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time   timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    constraint idx_role_permission
        unique (role_id, permission_id)
);

create table auth_user_role
(
    id          int auto_increment comment '用户角色ID'
        primary key,
    user_id     int                                 not null comment '用户ID',
    role_id     int                                 not null comment '角色ID',
    deleted     int       default 0                 not null comment '是否删除',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    constraint idx_user_role
        unique (user_id, role_id)
);

insert into auth_role(name, description)
values ('ROLE_SYSTEM_ADMIN', '系统管理员');

insert into auth_user_role (user_id, role_id)
values (1, 1);

alter table project_release
    add group_id bigint null comment '组id（项目存在引用时会生成组发布，生成组id）' after user_id;

alter table project_release
    add group_main tinyint null comment '是否为分组中的主项目' after group_id;

alter table font
    alter column deleted set default 0;

alter table template
    alter column deleted set default 0;


