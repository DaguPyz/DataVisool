-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table common_api
(
    id          bigint auto_increment comment 'id'
        primary key,
    name        varchar(255)                        null comment 'api名称',
    url         text                                not null comment '请求地址',
    method      varchar(10)                         not null comment '请求类型',
    params      text                                null comment '请求参数',
    headers     text                                null comment '请求头',
    deleted     int                                 not null comment '是否删除',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '公共API';