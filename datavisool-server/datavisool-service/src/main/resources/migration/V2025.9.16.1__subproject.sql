-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

alter table project
    add pid bigint null comment '父项目id';

alter table project_release
    add project_map text null comment '项目id与发布id之间的映射关系, 映射之间使用":",组之间使用“,”分割' after group_main;

alter table template
    add description varchar(225) null comment '模板描述' after name;

alter table template
    change thumbnail cover_url varchar(255) null comment '模板封面';

alter table system_config
    modify value text not null comment '配置项值';


