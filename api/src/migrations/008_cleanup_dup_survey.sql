-- One-off cleanup: remove the duplicate "General Skill Assessment" survey
-- created by the user "test".
--
-- Scoped strictly to owner = the 'test' user so it can never touch the seed
-- template "General Skills Assessment" (owned by the system user, id = 0).
-- Matches both the singular and plural spelling to be robust to however the
-- title was actually entered.
--
-- survey_questions rows cascade-delete (ON DELETE CASCADE). We exclude any
-- survey still referenced by a team_formation, because team_formations.survey_id
-- has no ON DELETE rule and the delete would otherwise fail with a foreign-key
-- constraint error and abort this migration.

DELETE FROM surveys
WHERE title IN ('General Skill Assessment', 'General Skills Assessment')
  AND owner_id = (SELECT id FROM users WHERE username = 'test')
  AND id NOT IN (SELECT survey_id FROM team_formations WHERE survey_id IS NOT NULL);
