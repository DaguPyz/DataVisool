-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
update user
set roles = CONCAT('ROLE_', roles)
where id > 0;

alter table file
    drop column type;

rename table file to image;

alter table dynamic_script
    change project_ids project_id bigint null comment '项目id null:表示为全局脚本';

