USE jobagent;

ALTER TABLE applications
  ADD COLUMN llm_score INT NULL,
  ADD COLUMN llm_verdict VARCHAR(16) DEFAULT '',
  ADD COLUMN llm_reason VARCHAR(1000) DEFAULT '';
