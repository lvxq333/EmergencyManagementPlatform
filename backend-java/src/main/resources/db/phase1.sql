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
INSERT INTO metric_definition(code,name,unit)
 SELECT 'vertical_displacement','垂直位移','mm'
 WHERE NOT EXISTS (SELECT 1 FROM metric_definition WHERE code='vertical_displacement');
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
