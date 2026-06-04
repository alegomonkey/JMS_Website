-- Add manual exclusion flag to responses for manager use on the results page.
ALTER TABLE survey_responses ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0;
