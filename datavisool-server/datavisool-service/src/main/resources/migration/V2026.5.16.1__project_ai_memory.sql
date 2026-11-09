-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table project_ai_memory
(
    project_id   bigint       not null comment '项目id'
        primary key,
    summary      text         not null comment '项目摘要',
    style_tone   text         not null comment '样式风格摘要',
    layout_tone  text         not null comment '布局摘要',
    color_system text         not null comment '色彩系统摘要',
    components   text         not null comment '组件摘要JSON',
    update_time  timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP comment '更新时间',
    create_time  timestamp default CURRENT_TIMESTAMP not null comment '创建时间'
)
    comment '项目AI记忆';
