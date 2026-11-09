-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table if not exists web_update_skip
(
    id              bigint auto_increment comment 'id' primary key,
    product_code    varchar(64) not null comment '产品标识',
    skipped_version varchar(64) not null comment '已跳过的版本号',
    skipped_by      bigint      not null comment '执行跳过的系统管理员ID',
    skipped_at      timestamp   not null default current_timestamp comment '跳过时间',
    unique key uk_web_update_skip_product_version (product_code, skipped_version)
)
    comment 'Web版本升级跳过记录';
