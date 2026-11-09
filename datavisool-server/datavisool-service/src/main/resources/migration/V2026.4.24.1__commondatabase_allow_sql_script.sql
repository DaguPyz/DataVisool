-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
alter table common_database
    add allow_sql_script tinyint(1) not null default 0 comment '是否允许执行脚本' after url;
