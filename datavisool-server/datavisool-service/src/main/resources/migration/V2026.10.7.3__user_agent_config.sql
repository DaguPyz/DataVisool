-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table user_agent_config
(
    id bigint auto_increment primary key,
    user_id bigint not null comment '所属用户 ID',
    config_key varchar(128) not null comment '配置键',
    config_value longtext not null comment '配置值，可保存 JSON',
    create_time timestamp default CURRENT_TIMESTAMP not null,
    update_time timestamp default CURRENT_TIMESTAMP not null,
    unique key uk_user_agent_config_owner_key (user_id, config_key)
) comment '用户 Agent 配置项';

-- 旧 system_config 没有用户归属，保留原记录，不自动复制到个人配置。
