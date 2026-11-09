-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
update ai_agent_thread thread
left join (
    select thread_id, max(sequence_no) as sequence_no
    from ai_agent_event
    group by thread_id
) event on event.thread_id = thread.thread_id
set thread.event_sequence_no = greatest(thread.event_sequence_no, coalesce(event.sequence_no, 0));
