-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
-- 新配置由服务端写入当前用户 ID；无法确认归属的历史记录保留为空，不对任何用户开放。
alter table ai_model
    add user_id bigint null comment '所属用户ID';

-- 原始系统管理员为用户 1，仅在该账号仍有效且保留系统管理员角色时迁移历史配置。
update ai_model
set user_id = (
    select min(u.id)
    from `user` u
             inner join auth_user_role ur on ur.user_id = u.id and ur.deleted = 0
             inner join auth_role r on r.id = ur.role_id and r.deleted = 0
    where u.id = 1
      and u.deleted = 0
      and r.name = 'ROLE_SYSTEM_ADMIN'
)
where user_id is null;

create index idx_ai_model_user_deleted_update_time
    on ai_model (user_id, deleted, is_default, enabled, update_time);
