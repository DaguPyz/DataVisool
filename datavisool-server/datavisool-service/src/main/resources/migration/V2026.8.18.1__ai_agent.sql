-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
/* AI Agent 领域数据：产品历史与 LangChain4j ChatMemory 分离保存。 */
create table if not exists ai_agent_thread
(
    thread_id        varchar(64)  not null primary key,
    project_id       varchar(64)  not null,
    user_id          varchar(64)  not null,
    title            varchar(255) null,
    status           varchar(32)  not null default 'active',
    current_turn_id  varchar(64)  null,
    created_at       bigint       not null,
    updated_at       bigint       not null,
    unique key uk_ai_agent_thread_scope (thread_id, user_id, project_id),
    key idx_ai_agent_thread_project (user_id, project_id, status, updated_at)
) comment 'AI Agent会话';

create table if not exists ai_agent_turn
(
    turn_id          varchar(64)  not null primary key,
    thread_id        varchar(64)  not null,
    input_text       text         not null,
    input_attachments longtext    null,
    context_json     longtext     null,
    status           varchar(32)  not null default 'queued',
    steer_version    int          not null default 0,
    created_at       bigint       not null,
    started_at       bigint       null,
    ended_at         bigint       null,
    key idx_ai_agent_turn_thread (thread_id, created_at),
    key idx_ai_agent_turn_status (status, created_at)
) comment 'AI Agent轮次';

create table if not exists ai_agent_item
(
    item_id          varchar(64)  not null primary key,
    thread_id        varchar(64)  not null,
    turn_id          varchar(64)  not null,
    item_type        varchar(64)  not null,
    content_json     longtext     not null,
    sequence_no      bigint       not null,
    created_at       bigint       not null,
    unique key uk_ai_agent_item_sequence (turn_id, sequence_no),
    key idx_ai_agent_item_thread (thread_id, created_at),
    key idx_ai_agent_item_turn (turn_id, sequence_no)
) comment 'AI Agent展示项';

create table if not exists ai_agent_run
(
    run_id           varchar(64)  not null primary key,
    turn_id          varchar(64)  not null,
    status           varchar(32)  not null default 'queued',
    cancel_requested int          not null default 0,
    checkpoint_id    varchar(64)  null,
    created_at       bigint       not null,
    started_at       bigint       null,
    ended_at         bigint       null,
    key idx_ai_agent_run_turn (turn_id),
    key idx_ai_agent_run_status (status, created_at)
) comment 'AI Agent运行';

create table if not exists ai_agent_event
(
    event_id         varchar(64)  not null primary key,
    thread_id        varchar(64)  not null,
    turn_id          varchar(64)  null,
    run_id           varchar(64)  null,
    sequence_no      bigint       not null,
    event_type       varchar(128) not null,
    payload_json     longtext     not null,
    created_at       bigint       not null,
    unique key uk_ai_agent_event_sequence (thread_id, sequence_no),
    key idx_ai_agent_event_thread (thread_id, sequence_no),
    key idx_ai_agent_event_run (run_id, sequence_no)
) comment 'AI Agent事件流';

create table if not exists ai_agent_checkpoint
(
    checkpoint_id    varchar(64)  not null primary key,
    run_id           varchar(64)  not null,
    state_json       longtext     not null,
    revision         bigint       not null default 0,
    status           varchar(32)  not null default 'active',
    created_at       bigint       not null,
    key idx_ai_agent_checkpoint_run (run_id, revision)
) comment 'AI Agent检查点';

create table if not exists ai_agent_attachment
(
    attachment_id    varchar(64)  not null primary key,
    thread_id        varchar(64)  not null,
    turn_id          varchar(64)  null,
    content_json     longtext     not null,
    created_at       bigint       not null,
    key idx_ai_agent_attachment_turn (thread_id, turn_id)
) comment 'AI Agent附件引用';

create table if not exists ai_agent_operation
(
    operation_id     varchar(128) not null primary key,
    project_id       varchar(64)  not null,
    thread_id        varchar(64)  not null,
    turn_id          varchar(64)  not null,
    run_id           varchar(64)  not null,
    operation_type   varchar(128) not null,
    status           varchar(32)  not null,
    request_json     longtext     not null,
    result_json      longtext     null,
    base_revision    bigint       null,
    result_revision  bigint       null,
    created_at       bigint       not null,
    updated_at       bigint       not null,
    key idx_ai_agent_operation_scope (project_id, thread_id, turn_id),
    key idx_ai_agent_operation_run (run_id, created_at)
) comment 'AI Agent画布操作幂等记录';

create table if not exists ai_agent_pending_input
(
    input_id         varchar(64)  not null primary key,
    thread_id        varchar(64)  not null,
    turn_id          varchar(64)  not null,
    run_id           varchar(64)  not null,
    prompt_json      longtext     not null,
    status           varchar(32)  not null default 'pending',
    answer_json      longtext     null,
    created_at       bigint       not null,
    updated_at       bigint       not null,
    key idx_ai_agent_pending_input_turn (turn_id, status, created_at)
) comment 'AI Agent待用户输入';
