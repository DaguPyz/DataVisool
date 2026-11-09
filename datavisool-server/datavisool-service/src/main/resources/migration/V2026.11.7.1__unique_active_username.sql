-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
-- Existing duplicate active usernames must be resolved before this migration is run.
ALTER TABLE user
    ADD COLUMN active_username varchar(255) GENERATED ALWAYS AS
        (CASE WHEN deleted = 0 THEN username ELSE NULL END) STORED,
    ADD UNIQUE KEY uk_user_active_username (active_username);
