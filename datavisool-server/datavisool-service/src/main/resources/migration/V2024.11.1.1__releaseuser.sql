-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
alter table project_release
    add user_id bigint not null comment '用户id' after expiration_date;

