CREATE DATABASE IF NOT EXISTS jobagent CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jobagent;

CREATE TABLE IF NOT EXISTS jobs (
  job_id VARCHAR(64) PRIMARY KEY,
  url TEXT NOT NULL,
  title VARCHAR(512) DEFAULT '',
  company VARCHAR(512) DEFAULT '',
  location VARCHAR(512) DEFAULT '',
  posted_text VARCHAR(128) DEFAULT '',
  jd_text MEDIUMTEXT,
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_first_seen (first_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL UNIQUE,
  score INT DEFAULT 0,
  status ENUM('applied','skipped','failed','already_applied','manual','needs_review') NOT NULL DEFAULT 'skipped',
  answers_json JSON NULL,
  screenshot_path VARCHAR(1024) DEFAULT '',
  error VARCHAR(1024) DEFAULT '',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS search_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  keywords TEXT,
  location VARCHAR(256) DEFAULT '',
  found_count INT DEFAULT 0,
  new_count INT DEFAULT 0,
  applied_count INT DEFAULT 0,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_id BIGINT NULL,
  level VARCHAR(16) DEFAULT 'info',
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS questionnaire_answers (
  `key` VARCHAR(128) PRIMARY KEY,
  `value` VARCHAR(1024) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
