-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table font
(
    id          bigint auto_increment comment 'id' primary key,
    name        varchar(255)                        not null null comment '字体名称',
    url         varchar(255)                        not null comment '字体路径',
    deleted     int                                 not null comment '是否删除',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '字体';

create table dynamic_script
(
    id          bigint auto_increment comment 'id' primary key,
    name        varchar(255)                        not null null comment '脚本名称',
    url         varchar(255)                        not null comment '脚本路径',
    type        varchar(255)                        not null comment '脚本类型 手动上传脚本、在线脚本(包括CDN脚本)',
    project_ids varchar(999)                        null comment '项目id列表 null:表示为全局脚本',
    deleted     int                                 not null comment '是否删除',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '动态脚本';