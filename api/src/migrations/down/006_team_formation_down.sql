-- Down migration for 006_team_formation.sql.
-- NOT executed by the migration runner (forward-only). Apply manually via:
--   sqlite3 /data/jms.db < api/src/migrations/006_team_formation_down.sql

DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS slot_reservations;
DROP TABLE IF EXISTS survey_responses;
DROP TABLE IF EXISTS team_formation_aliases;
DROP TABLE IF EXISTS team_formations;
DROP TABLE IF EXISTS survey_questions;
DROP TABLE IF EXISTS surveys;
DELETE FROM users WHERE id = 0;
DELETE FROM schema_migrations WHERE filename = '006_team_formation.sql';
