-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
alter table common_database
    add user_id bigint null comment '用户id';

alter table common_api
    add user_id bigint null comment '用户id';

alter table dynamic_script
    add user_id bigint null comment '用户id';

alter table font
    add user_id bigint null comment '用户id';

alter table image
    add user_id bigint null comment '用户id';

alter table remote_component
    add user_id bigint null comment '用户id';

alter table dynamic_script
    alter column deleted set default 0;

