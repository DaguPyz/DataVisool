-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
alter table project_release
    alter column state set default 1;

alter table project_release
    alter column deleted set default 0;

alter table common_api
    alter column deleted set default 0;

alter table common_database
    alter column deleted set default 0;

alter table remote_component
    alter column deleted set default 0;

