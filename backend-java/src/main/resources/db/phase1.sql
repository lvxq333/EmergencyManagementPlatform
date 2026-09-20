-- Apply to the existing risk_platform_db database. Additive and safe to re-run.
/*!40101 SET NAMES utf8mb4 */;
CREATE TABLE IF NOT EXISTS station (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 region VARCHAR(120) NOT NULL,
 longitude DOUBLE NOT NULL,
 latitude DOUBLE NOT NULL,
 coordinate_system VARCHAR(32) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS metric_definition (
 code VARCHAR(64) PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 unit VARCHAR(32) NOT NULL
);
CREATE TABLE IF NOT EXISTS station_profile (
 station_id BIGINT PRIMARY KEY,
 station_type VARCHAR(32) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(station_id) REFERENCES station(id)
);
CREATE TABLE IF NOT EXISTS metric_definition_profile (
 metric_code VARCHAR(64) PRIMARY KEY,
 minimum_value DOUBLE NULL,
 maximum_value DOUBLE NULL,
 sampling_requirement VARCHAR(255) NOT NULL,
 FOREIGN KEY(metric_code) REFERENCES metric_definition(code)
);
INSERT INTO metric_definition(code,name,unit)
 SELECT 'vertical_displacement','垂直位移','mm'
 WHERE NOT EXISTS (SELECT 1 FROM metric_definition WHERE code='vertical_displacement');
INSERT INTO metric_definition_profile(metric_code,minimum_value,maximum_value,sampling_requirement)
 SELECT 'vertical_displacement',-100000,100000,'带时区采集时间；上报解算后的垂直位移结果'
 WHERE NOT EXISTS (SELECT 1 FROM metric_definition_profile WHERE metric_code='vertical_displacement');
CREATE TABLE IF NOT EXISTS device (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 station_id BIGINT NOT NULL,
 device_type VARCHAR(64) NOT NULL,
 metric_code VARCHAR(64) NOT NULL,
 interval_seconds INT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY (station_id) REFERENCES station(id),
 FOREIGN KEY (metric_code) REFERENCES metric_definition(code)
);
CREATE TABLE IF NOT EXISTS device_profile (
 device_id BIGINT PRIMARY KEY,
 protocol VARCHAR(16) NOT NULL,
 FOREIGN KEY(device_id) REFERENCES device(id)
);
CREATE TABLE IF NOT EXISTS observation (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 device_id BIGINT NOT NULL,
 message_id VARCHAR(128) NOT NULL,
 event_time TIMESTAMP(3) NOT NULL,
 received_at TIMESTAMP(3) NOT NULL,
 metric_code VARCHAR(64) NOT NULL,
 metric_value DOUBLE NOT NULL,
 unit VARCHAR(32) NOT NULL,
 source_type VARCHAR(16) NOT NULL,
 submitted_by BIGINT NOT NULL,
 UNIQUE (device_id, message_id),
 INDEX idx_observation_device_time (device_id, event_time, id),
 INDEX idx_observation_received (device_id, received_at),
 FOREIGN KEY (device_id) REFERENCES device(id),
 FOREIGN KEY (metric_code) REFERENCES metric_definition(code)
);
CREATE TABLE IF NOT EXISTS simulation_job (
 device_id BIGINT PRIMARY KEY,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 base_value DOUBLE NOT NULL,
 amplitude DOUBLE NOT NULL,
 interval_seconds INT NOT NULL,
 sample_index BIGINT NOT NULL DEFAULT 0,
 next_run_at TIMESTAMP(3) NOT NULL,
 last_run_at TIMESTAMP(3) NULL,
 last_status VARCHAR(16) NULL,
 last_error VARCHAR(255) NULL,
 updated_by BIGINT NOT NULL,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (device_id) REFERENCES device(id)
);

CREATE TABLE IF NOT EXISTS pipeline_segment (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 pipeline_type VARCHAR(32) NOT NULL,
 region VARCHAR(120) NOT NULL,
 geometry_json TEXT NULL,
 length_km DOUBLE NOT NULL,
 data_source VARCHAR(120) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS device_pipeline_relation (
 device_id BIGINT NOT NULL,
 pipeline_segment_id BIGINT NOT NULL,
 PRIMARY KEY(device_id,pipeline_segment_id),
 FOREIGN KEY(device_id) REFERENCES device(id),
 FOREIGN KEY(pipeline_segment_id) REFERENCES pipeline_segment(id)
);
CREATE TABLE IF NOT EXISTS device_credential (
 device_id BIGINT PRIMARY KEY,
 key_hash CHAR(64) NOT NULL,
 key_prefix VARCHAR(16) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_by BIGINT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 last_used_at TIMESTAMP(3) NULL,
 FOREIGN KEY(device_id) REFERENCES device(id)
);
CREATE TABLE IF NOT EXISTS ingest_request_log (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 device_id BIGINT NULL,
 device_code VARCHAR(64) NULL,
 message_id VARCHAR(128) NULL,
 status VARCHAR(24) NOT NULL,
 http_status INT NOT NULL,
 detail VARCHAR(255) NULL,
 remote_address VARCHAR(64) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_ingest_log_device_time(device_id,created_at)
);
CREATE TABLE IF NOT EXISTS dataset (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL,
 source_type VARCHAR(16) NOT NULL,
 use_scope VARCHAR(255) NOT NULL,
 status VARCHAR(24) NOT NULL,
 original_filename VARCHAR(255) NOT NULL,
 file_sha256 CHAR(64) NOT NULL,
 created_by BIGINT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 published_at TIMESTAMP(3) NULL
);
CREATE TABLE IF NOT EXISTS dataset_original_file (
 dataset_id BIGINT PRIMARY KEY,
 content BLOB NOT NULL,
 FOREIGN KEY(dataset_id) REFERENCES dataset(id)
);
CREATE TABLE IF NOT EXISTS import_job (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 dataset_id BIGINT NOT NULL,
 status VARCHAR(24) NOT NULL,
 total_rows INT NOT NULL DEFAULT 0,
 valid_rows INT NOT NULL DEFAULT 0,
 error_rows INT NOT NULL DEFAULT 0,
 error_report TEXT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 completed_at TIMESTAMP(3) NULL,
 FOREIGN KEY(dataset_id) REFERENCES dataset(id)
);
CREATE TABLE IF NOT EXISTS import_staging (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 job_id BIGINT NOT NULL,
 row_number INT NOT NULL,
 device_code VARCHAR(64) NULL,
 message_id VARCHAR(128) NULL,
 event_time TIMESTAMP(3) NULL,
 metric_code VARCHAR(64) NULL,
 metric_value DOUBLE NULL,
 unit VARCHAR(32) NULL,
 source_type VARCHAR(16) NULL,
 error_message VARCHAR(500) NULL,
 FOREIGN KEY(job_id) REFERENCES import_job(id)
);
CREATE TABLE IF NOT EXISTS observation_context (
 observation_id BIGINT PRIMARY KEY,
 dataset_id BIGINT NULL,
 ingest_method VARCHAR(16) NOT NULL,
 quality_status VARCHAR(24) NOT NULL,
 FOREIGN KEY(observation_id) REFERENCES observation(id),
 FOREIGN KEY(dataset_id) REFERENCES dataset(id)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 actor_type VARCHAR(16) NOT NULL,
 actor_id BIGINT NULL,
 action VARCHAR(64) NOT NULL,
 target_type VARCHAR(32) NOT NULL,
 target_id VARCHAR(64) NULL,
 detail VARCHAR(500) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
