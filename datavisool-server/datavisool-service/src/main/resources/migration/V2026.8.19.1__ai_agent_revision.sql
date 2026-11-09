-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
alter table ai_agent_operation
    modify column base_revision varchar(128) null,
    modify column result_revision varchar(128) null;

alter table ai_agent_turn
    add column request_id varchar(64) null after thread_id,
    add unique key uk_ai_agent_turn_request (thread_id, request_id);

alter table ai_agent_run
    add column consumed_steer_version int not null default 0 after cancel_requested,
    add column worker_id varchar(64) null after consumed_steer_version,
    add column lease_expires_at bigint null after worker_id,
    add key idx_ai_agent_run_lease (status, lease_expires_at);
