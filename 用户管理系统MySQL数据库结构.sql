-- 数据库名: risk_platform_db
-- 平台用户管理模块数据库结构

-- ----------------------------
-- 解决报错：Error Code: 1046. No database selected
-- 检查并创建数据库，然后切换到该数据库
-- ----------------------------
CREATE DATABASE IF NOT EXISTS `risk_platform_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `risk_platform_db`;


-- ----------------------------
-- 1. 用户信息表 (users)
-- 存储平台所有用户的基础信息
-- ----------------------------
CREATE TABLE `users` (
  `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID，主键',
  `username` VARCHAR(64) NOT NULL UNIQUE COMMENT '登录用户名',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希值（出于安全考虑，不存储明文密码）',
  `real_name` VARCHAR(64) DEFAULT NULL COMMENT '真实姓名',
  `email` VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
  `phone` VARCHAR(32) DEFAULT NULL COMMENT '联系电话',
  `is_active` TINYINT(1) NOT NULL DEFAULT '1' COMMENT '账户状态：1-激活, 0-禁用',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台用户表';

-- ----------------------------
-- 2. 角色表 (roles)
-- 存储角色信息，如 管理员, 巡检员, 普通用户
-- ----------------------------
CREATE TABLE `roles` (
  `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色ID，主键',
  `role_name` VARCHAR(64) NOT NULL UNIQUE COMMENT '角色名称 (如: Administrator, Inspector)',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '角色描述',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- ----------------------------
-- 3. 权限表 (permissions)
-- 存储系统中的所有权限点，粒度至API/菜单级
-- ----------------------------
CREATE TABLE `permissions` (
  `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '权限ID，主键',
  `permission_key` VARCHAR(128) NOT NULL UNIQUE COMMENT '权限唯一标识 (如: user:create, menu:risk_sensing)',
  `permission_name` VARCHAR(128) NOT NULL COMMENT '权限名称 (如: 创建用户, 风险感知菜单)',
  `module` VARCHAR(64) NOT NULL COMMENT '所属模块 (如: user, risk_sensing)',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- ----------------------------
-- 4. 用户-角色关联表 (user_roles)
-- 多对多关系：一个用户可以有多个角色
-- ----------------------------
CREATE TABLE `user_roles` (
  `user_id` INT(11) UNSIGNED NOT NULL COMMENT '用户ID',
  `role_id` INT(11) UNSIGNED NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`user_id`, `role_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联表';

-- ----------------------------
-- 5. 角色-权限关联表 (role_permissions)
-- 多对多关系：一个角色可以有多个权限
-- ----------------------------
CREATE TABLE `role_permissions` (
  `role_id` INT(11) UNSIGNED NOT NULL COMMENT '角色ID',
  `permission_id` INT(11) UNSIGNED NOT NULL COMMENT '权限ID',
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限关联表';


-- ----------------------------
-- 初始数据填充 (示例数据)
-- ----------------------------

-- 角色数据
INSERT INTO `roles` (`role_name`, `description`) VALUES
('Administrator', '超级管理员，拥有所有权限'),
('Inspector', '现场巡检员，拥有风险感知和数据录入权限'),
('Viewer', '普通查看员，仅有数据查看权限');

-- 权限数据 (示例)
INSERT INTO `permissions` (`permission_key`, `permission_name`, `module`) VALUES
('user:manage', '用户管理菜单', 'System'),
('role:manage', '角色权限配置', 'System'),
('risk:view_all', '查看所有风险数据', 'RiskSensing'),
('risk:trigger_warn', '手动触发预警', 'RiskSensing'),
('data:input', '传感器数据录入', 'DataManagement');

show tables;
select * from users;
select * from roles;
select * from permissions;
select * from user_roles;
select * from role_permissions;



