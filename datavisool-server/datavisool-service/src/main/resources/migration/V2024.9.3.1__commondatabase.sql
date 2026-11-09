-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
rename table datasource to common_database;

alter table common_database
    add ip varchar(225) not null comment 'ip/域名' after type;

alter table common_database
    add port varchar(20) not null comment '端口' after ip;

alter table common_database
    add database_name varchar(225) not null comment '数据库名' after port;

alter table common_database
    modify type varchar(100) not null comment '数据源类型';

alter table common_database
    modify url varchar(255) null comment '数据源链接地址';


