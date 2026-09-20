CREATE DATABASE IF NOT EXISTS `risk_platform_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `risk_platform_db`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID，主键',
  `username` VARCHAR(64) NOT NULL UNIQUE COMMENT '登录用户名',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希值',
  `real_name` VARCHAR(64) DEFAULT NULL COMMENT '真实姓名',
  `email` VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
  `phone` VARCHAR(32) DEFAULT NULL COMMENT '联系电话',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '账户状态：1-激活, 0-禁用',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台用户表';

CREATE TABLE IF NOT EXISTS `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色ID，主键',
  `role_name` VARCHAR(64) NOT NULL UNIQUE COMMENT '角色名称',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '角色描述',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '权限ID，主键',
  `permission_key` VARCHAR(128) NOT NULL UNIQUE COMMENT '权限唯一标识',
  `permission_name` VARCHAR(128) NOT NULL COMMENT '权限名称',
  `module` VARCHAR(64) NOT NULL COMMENT '所属模块',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`user_id`, `role_id`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联表';

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '权限ID',
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限关联表';

CREATE TABLE IF NOT EXISTS `risk_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `summary_json` JSON NOT NULL COMMENT '风险汇总JSON',
  `metrics_json` JSON NOT NULL COMMENT '指标JSON',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='风险快照表';

CREATE TABLE IF NOT EXISTS `risk_alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `region_name` VARCHAR(64) NOT NULL COMMENT '区域名称',
  `risk_value` INT NOT NULL COMMENT '风险值',
  `risk_level` VARCHAR(32) NOT NULL COMMENT '风险等级',
  `message` VARCHAR(255) NOT NULL COMMENT '告警消息',
  `handled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否处置',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_risk_alerts_region_created` (`region_name`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='风险告警表';

INSERT IGNORE INTO `roles` (`id`, `role_name`, `description`) VALUES
(1, 'Administrator', '超级管理员，拥有所有权限'),
(2, 'Inspector', '现场巡检员，拥有风险感知和数据录入权限'),
(3, 'Viewer', '普通查看员，仅有数据查看权限');

INSERT IGNORE INTO `permissions` (`id`, `permission_key`, `permission_name`, `module`) VALUES
(1, 'user:manage', '用户管理菜单', 'System'),
(2, 'role:manage', '角色权限配置', 'System'),
(3, 'risk:view_all', '查看所有风险数据', 'RiskSensing'),
(4, 'risk:trigger_warn', '手动触发预警', 'RiskSensing'),
(5, 'data:input', '传感器数据录入', 'DataManagement');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
(2, 3), (2, 4), (2, 5),
(3, 3);
