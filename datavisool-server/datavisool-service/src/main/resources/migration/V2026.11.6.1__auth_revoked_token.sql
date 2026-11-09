-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
create table auth_revoked_token
(
    token_hash char(64) not null primary key,
    expires_at bigint not null,
    index idx_auth_revoked_token_expires_at (expires_at)
);
