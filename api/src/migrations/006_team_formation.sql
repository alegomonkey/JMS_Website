-- Team Formation feature: surveys, team_formation sessions, slot management,
-- results, and 5 seed surveys owned by a system user (id=0).

-- System user owns seed surveys. id=0 is a valid SQLite rowid; real users
-- autoincrement from 1 so no collision is possible.
INSERT OR IGNORE INTO users(id, username, password_hash, role)
VALUES (0, 'system', NULL, 'admin');

-- ── Surveys ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surveys (
  id           INTEGER PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id),
  title        TEXT    NOT NULL,
  description  TEXT,
  is_public    INTEGER NOT NULL DEFAULT 0,
  is_approved  INTEGER NOT NULL DEFAULT 0,
  tags         TEXT    NOT NULL DEFAULT '[]',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id          INTEGER PRIMARY KEY,
  survey_id   INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  block_type  TEXT    NOT NULL CHECK (block_type IN (
                'skill_selection','skill_level','written_answer',
                'negative_skill','avoid_respondent','custom_scale','multiple_choice')),
  prompt      TEXT    NOT NULL,
  config      TEXT    NOT NULL DEFAULT '{}'
);

-- ── Team Formation Sessions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_formations (
  id               INTEGER PRIMARY KEY,
  manager_id       INTEGER NOT NULL REFERENCES users(id),
  title            TEXT    NOT NULL,
  description      TEXT,
  num_teams        INTEGER NOT NULL CHECK (num_teams >= 2),
  target_team_size INTEGER NOT NULL CHECK (target_team_size >= 1),
  survey_id        INTEGER REFERENCES surveys(id),
  survey_snapshot  TEXT,
  invite_code      TEXT    NOT NULL UNIQUE,
  slot_mode        TEXT    NOT NULL DEFAULT 'numbered'
                             CHECK (slot_mode IN ('numbered','named')),
  slot_count       INTEGER NOT NULL CHECK (slot_count >= 1),
  slots_submitted  INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','active','closed','formed')),
  closes_at        INTEGER,
  rng_seed         INTEGER,
  formed_at        INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS team_formation_aliases (
  id                INTEGER PRIMARY KEY,
  team_formation_id INTEGER NOT NULL REFERENCES team_formations(id) ON DELETE CASCADE,
  display_name      TEXT    NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (team_formation_id, display_name)
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id                INTEGER PRIMARY KEY,
  team_formation_id INTEGER NOT NULL REFERENCES team_formations(id) ON DELETE CASCADE,
  slot_number       INTEGER,
  alias_id          INTEGER REFERENCES team_formation_aliases(id),
  answers           TEXT    NOT NULL DEFAULT '{}',
  submitted_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_response_slot
  ON survey_responses (team_formation_id, slot_number)
  WHERE slot_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_responses_tf
  ON survey_responses (team_formation_id);

CREATE TABLE IF NOT EXISTS slot_reservations (
  id                INTEGER PRIMARY KEY,
  team_formation_id INTEGER NOT NULL REFERENCES team_formations(id) ON DELETE CASCADE,
  slot_number       INTEGER NOT NULL,
  session_token     TEXT    NOT NULL,
  reserved_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at        INTEGER NOT NULL,
  UNIQUE (team_formation_id, slot_number)
);
CREATE INDEX IF NOT EXISTS idx_slot_res_expires
  ON slot_reservations (expires_at);

CREATE TABLE IF NOT EXISTS teams (
  id                INTEGER PRIMARY KEY,
  team_formation_id INTEGER NOT NULL REFERENCES team_formations(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS team_members (
  id          INTEGER PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  UNIQUE (team_id, response_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_team
  ON team_members (team_id);

-- ── Seed Surveys ─────────────────────────────────────────────────────────────
-- 5 public, approved template surveys owned by the system user (id=0).
-- Explicit IDs (101–105 for surveys, 101–145 for questions) ensure
-- parent_question_id references work in static SQL without last_insert_rowid().

-- Survey 1: General Skills Assessment
INSERT OR IGNORE INTO surveys(id, owner_id, title, description, is_public, is_approved, tags)
VALUES (
  101, 0,
  'General Skills Assessment',
  'A versatile survey for grouping participants by professional skill area and proficiency.',
  1, 1,
  '["skills","general"]'
);
INSERT OR IGNORE INTO survey_questions(id, survey_id, sort_order, block_type, prompt, config)
VALUES
  (101, 101, 0, 'skill_selection',
   'Which of the following skills do you have experience with?',
   '{"categories":["Engineering","Design","Product","Data","Marketing"],"multi_select":true}'),
  (102, 101, 1, 'skill_level',
   'Rate your proficiency in each of your selected skills (1 = beginner, 10 = expert):',
   '{"parent_question_id":101,"min":1,"max":10}'),
  (103, 101, 2, 'written_answer',
   'Briefly describe your most relevant experience for this project:',
   '{"max_chars":500,"placeholder":""}');

-- Survey 2: Hackathon Team Builder
INSERT OR IGNORE INTO surveys(id, owner_id, title, description, is_public, is_approved, tags)
VALUES (
  102, 0,
  'Hackathon Team Builder',
  'Matches participants by technical role strength and surfaces areas people prefer to avoid.',
  1, 1,
  '["hackathon","technical","skills"]'
);
INSERT OR IGNORE INTO survey_questions(id, survey_id, sort_order, block_type, prompt, config)
VALUES
  (111, 102, 0, 'skill_selection',
   'Which technical areas are you comfortable working in?',
   '{"categories":["Frontend","Backend","ML/AI","DevOps","UX Research","PM"],"multi_select":true}'),
  (112, 102, 1, 'skill_level',
   'How would you rate your skill level in each of your selected areas?',
   '{"parent_question_id":111,"min":1,"max":10}'),
  (113, 102, 2, 'written_answer',
   'What is a project or hack you are proud of?',
   '{"max_chars":500,"placeholder":""}'),
  (114, 102, 3, 'negative_skill',
   'Are there any areas you would prefer not to focus on during the hackathon?',
   '{"categories":["Frontend","Backend","ML/AI","DevOps","UX Research","PM"]}');

-- Survey 3: Academic Group Project
INSERT OR IGNORE INTO surveys(id, owner_id, title, description, is_public, is_approved, tags)
VALUES (
  103, 0,
  'Academic Group Project',
  'Groups students by complementary academic strengths and optional teammate preferences.',
  1, 1,
  '["academic","education","group work"]'
);
INSERT OR IGNORE INTO survey_questions(id, survey_id, sort_order, block_type, prompt, config)
VALUES
  (121, 103, 0, 'skill_selection',
   'Which project roles match your strengths?',
   '{"categories":["Research","Writing","Presentation","Data Analysis","Coordination"],"multi_select":true}'),
  (122, 103, 1, 'skill_level',
   'Rate your skill level in each selected area:',
   '{"parent_question_id":121,"min":1,"max":10}'),
  (123, 103, 2, 'written_answer',
   'Describe your experience with collaborative academic work:',
   '{"max_chars":500,"placeholder":""}'),
  -- hidden in numbered mode at response time
  (124, 103, 3, 'avoid_respondent',
   'Is there anyone you would prefer not to be grouped with? (optional)',
   '{"label":"Avoid grouping with"}');

-- Survey 4: Startup Co-founder Matching
INSERT OR IGNORE INTO surveys(id, owner_id, title, description, is_public, is_approved, tags)
VALUES (
  104, 0,
  'Startup Co-founder Matching',
  'Matches founders by complementary domain expertise and working style preferences.',
  1, 1,
  '["startup","founders","entrepreneurship"]'
);
INSERT OR IGNORE INTO survey_questions(id, survey_id, sort_order, block_type, prompt, config)
VALUES
  (131, 104, 0, 'skill_selection',
   'Which co-founder roles align with your background?',
   '{"categories":["Technical","Business","Design","Operations","Sales"],"multi_select":true}'),
  (132, 104, 1, 'skill_level',
   'How experienced are you in each of your selected domains?',
   '{"parent_question_id":131,"min":1,"max":10}'),
  (133, 104, 2, 'written_answer',
   'What kind of startup problem excites you most?',
   '{"max_chars":500,"placeholder":""}'),
  (134, 104, 3, 'written_answer',
   'Describe your biggest professional win in 2-3 sentences:',
   '{"max_chars":500,"placeholder":""}'),
  (135, 104, 4, 'written_answer',
   'What are you hoping to build in the next 12 months?',
   '{"max_chars":500,"placeholder":""}'),
  -- hidden in numbered mode at response time
  (136, 104, 5, 'avoid_respondent',
   'Is there anyone in this cohort you would prefer not to be matched with? (optional)',
   '{"label":"Avoid matching with"}');

-- Survey 5: Sports / Recreational Teams
INSERT OR IGNORE INTO surveys(id, owner_id, title, description, is_public, is_approved, tags)
VALUES (
  105, 0,
  'Sports / Recreational Teams',
  'Balances recreational teams by athleticism, competitiveness, availability, and preferred positions.',
  1, 1,
  '["sports","recreational","fitness"]'
);
INSERT OR IGNORE INTO survey_questions(id, survey_id, sort_order, block_type, prompt, config)
VALUES
  (141, 105, 0, 'custom_scale',
   'How would you rate your overall athleticism?',
   '{"min":1,"max":10,"min_label":"Recreational","max_label":"Competitive athlete"}'),
  (142, 105, 1, 'custom_scale',
   'How competitive are you?',
   '{"min":1,"max":10,"min_label":"Just here for fun","max_label":"Very competitive"}'),
  (143, 105, 2, 'custom_scale',
   'How many hours per week are you available to play?',
   '{"min":1,"max":10,"min_label":"1-2 hrs","max_label":"10+ hrs"}'),
  (144, 105, 3, 'multiple_choice',
   'Which positions are you comfortable playing?',
   '{"options":["Offense","Defense","Goalkeeper","Utility/Any"],"allow_multiple":true}'),
  (145, 105, 4, 'written_answer',
   'Anything else we should know when forming your team?',
   '{"max_chars":300,"placeholder":""}');
