-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
drop table if exists datasource;
drop table if exists file;
drop table if exists local_auth;
drop table if exists migration_history;
drop table if exists project;
drop table if exists user;

create table datasource
(
    id          bigint auto_increment comment 'id'
        primary key,
    name        varchar(255)                        null comment '数据源链接名称',
    type        int                                 not null comment '数据源类型',
    username    varchar(20)                         not null comment '用户名',
    password    varchar(255)                        not null comment '数据源链接密码',
    url         varchar(255)                        not null comment '数据源链接地址',
    des         varchar(255)                        null comment '数据源链接描述',
    deleted     int                                 not null comment '是否删除',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '数据源管理';

create table file
(
    id          bigint auto_increment comment '主键'
        primary key,
    url         varchar(255)                       not null comment '图片路径片段',
    name        varchar(255)                       null comment '图片名称',
    type        int                                not null comment '文件类型，例如：图片、视频、模型等',
    create_time datetime default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time datetime default CURRENT_TIMESTAMP not null comment '更新时间',
    deleted     int      default 0                 not null comment '是否删除 0:未删除 1:已删除',
    project_id  bigint                             not null comment '项目id',
    hash        varchar(255)                       null comment '图片hash'
);

create table local_auth
(
    id          bigint auto_increment
        primary key,
    password    varchar(255)                        not null comment '密码',
    user_id     bigint                              not null comment '用户id',
    deleted     int       default 0                 not null comment '删除标志',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间'
);

create table migration_history
(
    id           varchar(32)                         not null
        primary key,
    version      varchar(128)                        not null,
    file_name    varchar(255)                        not null,
    execute_user varchar(128)                        not null,
    execute_date timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    success      tinyint(1)                          not null
);

create table project
(
    id          bigint auto_increment comment '主键'
        primary key,
    name        varchar(255)                       not null comment '项目名称',
    des         varchar(255)                       null comment '项目描述',
    create_time datetime default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time datetime default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    deleted     int      default 0                 not null comment '是否删除 0:未删除 1:已删除',
    data_json   longtext                           null comment '数据json',
    cover       varchar(255)                       null comment '封面',
    user_id     bigint                             not null comment '用户id'
);

create table user
(
    id          bigint auto_increment
        primary key,
    name        varchar(255)                        null comment '显示名称',
    username    varchar(255)                        not null,
    email       varchar(255)                        null,
    phone       varchar(255)                        null,
    avatar      varchar(255)                        null,
    create_time timestamp default CURRENT_TIMESTAMP not null,
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    deleted     int       default 0                 null,
    roles       varchar(255)                        not null comment '角色'
);

insert into user (id, name, username, roles)
values (1, '系统管理员', 'admin', 'SYSTEM_ADMIN');

insert into local_auth (password, user_id)
values ('!DATAVISOOL_INITIAL_ADMIN_PASSWORD_REQUIRED!', 1);
