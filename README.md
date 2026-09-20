# 应急管理平台（EmergencyManagementPlatform）

包含风险监测展示、用户管理、角色权限管理，以及 Node.js 和 Java 后端实现。

## 项目结构

- `home.html`、`index.html`、`login.html`、`register.html`：前端页面。
- `用户管理控制台.html`：用户与权限管理页面。
- `assets/`：图表、地图及前端样式脚本。
- `backend-java/`：Spring Boot 后端与测试。
- `server.js`、`db.js`：Node.js / MySQL 后端。
- `server-file.js`：使用本地 JSON 文件存储的 Node.js 后端。
- `deploy/`、`nginx/`：部署脚本与配置。
- `docs/`、`output/`：接口文档、部署说明与项目规划。

## 快速运行：文件存储版本

安装 Node.js 和 npm，然后执行：

```bash
npm ci
export JWT_SECRET="$(openssl rand -hex 32)"
npm run start:file
```

访问 <http://localhost:18080/login.html>。运行数据默认保存在 `data/platform.json`，不提交到 Git。

## Node.js / MySQL 版本

1. 安装 MySQL，导入 `用户管理系统MySQL数据库结构.sql`。
2. 执行 `npm ci`。
3. 执行 `cp .env.example .env`，填写数据库配置与随机 JWT 密钥。
4. 执行 `npm start`。

## Java 后端与部署

参见 [部署文档](docs/deployment.md)、[接口文档](docs/接口文档.md) 和 [阶段一开发说明](docs/阶段一开发说明.md)。

阶段一已支持设备独立密钥持续 HTTP 上报、接入日志、管段关系、CSV 数据集校验与发布。CSV 模板位于 `datasets/templates/observation-import-template.csv`，也可在“数据接入”页面下载。

配置中的本地开发示例密码仅用于隔离的开发环境，部署前应设置自己的数据库密码及 JWT 密钥。

## 仓库说明

本仓库以当前项目快照作为初始版本，未包含旧仓库历史、依赖安装目录、构建产物、编辑器配置或本地环境文件。
