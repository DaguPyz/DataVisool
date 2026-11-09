-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table if not exists remote_component_document
(
    id bigint auto_increment primary key comment '文档索引 ID',
    remote_component_id bigint not null comment '服务器组件 ID',
    user_id bigint not null comment '所属用户 ID',
    component_type varchar(128) not null comment '组件类型',
    component_version varchar(64) not null comment '资源版本',
    package_url varchar(1024) not null comment '该版本代码入口',
    index_json longtext not null comment '文件与章节元数据，不含正文；应用限制为16 KiB',
    deleted int default 0 not null comment '逻辑删除标识',
    create_time timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    update_time timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    index idx_component_document_owner (user_id, remote_component_id, component_version),
    index idx_component_document_package (remote_component_id, deleted)
) comment '服务器组件文档动态索引';

alter table remote_component_document
    modify column index_json longtext not null comment '文件与章节元数据，不含正文；应用限制为16 KiB';
