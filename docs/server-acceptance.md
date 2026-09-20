# 服务器验收部署（2026-09-20）

## 验收入口

http://10.21.255.108:18080/login.html （需连接服务器所在网络）

使用原有账号密码，切换后需重新登录。原 Node 文件存储中的 3 个用户、密码哈希、启用状态、角色和权限已迁入私有 MySQL。

在首页进入“数据接入”，可查看 `ACCEPTANCE-DEMO-001` 站点和 `ACCEPTANCE-DISP-001` 位移设备，并验收管段关系、设备密钥、接入日志和 CSV 数据集功能。既有验收数据全部标记为 SIMULATED；自动模拟任务完成测试后已停止，可在页面重新启动。其他风险专题仍含演示数据。

## 运行结构

- Node 网关 `deploy/server-gateway.mjs`：对外 18080，提供前端并将 `/api` 转发给 Java。
- Java 17 / Spring Boot：仅监听 127.0.0.1:18081，启用阶段一监测接口和后台模拟调度。
- 独立账户 MySQL：仅监听 127.0.0.1:13316，未修改共享 3306 数据库；当前使用服务器已有 MySQL 5.7 程序的独立副本。
- Redis 和原风险演示快照持久化关闭；监测记录正常写入 MySQL。
- 三个服务由用户级 systemd 管理，配置了故障重启，账户 linger 已启用。

服务器路径（以下 `$HOME` 均指 `hexiang` 的 home）：

| 内容 | 路径 |
| --- | --- |
| 当前应用链接 | `$HOME/apps/risk-platform` |
| 当前发布目录 | `$HOME/apps/risk-platform-releases/phase1-complete-b73e646` |
| Java 运行时 | `$HOME/apps/risk-platform-tools/jre17` |
| 私有数据库文件 | `$HOME/apps/risk-platform-mysql` |
| Java / 网关环境配置 | `$HOME/.config/risk-platform/java.env`、`gateway.env` |
| 数据库管理连接配置 | `$HOME/.config/risk-platform/mysql-admin.cnf` |
| 原始备份包 | `$HOME/apps/risk-platform-backups/pre-java-20260920.tar.gz` |
| 旧应用目录 | `$HOME/apps/risk-platform-backups/legacy-app-20260920` |

配置文件权限为 600。旧 JSON 数据仍留在原路径作为历史备份，切换后的新操作仅写入 MySQL。

## 运维

SSH 登录 `hexiang` 后执行：

```sh
systemctl --user status risk-platform-mysql risk-platform-java risk-platform-gateway
journalctl --user -u risk-platform-java -n 100 --no-pager
systemctl --user restart risk-platform-java risk-platform-gateway
```

数据库备份：

```sh
umask 077
mysqldump --defaults-extra-file="$HOME/.config/risk-platform/mysql-admin.cnf" \
  --single-transaction --routines --triggers risk_platform_db \
  > "$HOME/apps/risk-platform-backups/risk-platform-$(date +%Y%m%d-%H%M%S).sql"
```

原 `deploy/hexiang-start.sh` 仅用于旧 Node 版本。当前版本使用上述 systemd 命令。

## 回退说明

旧版应用及 JSON 数据已保留。需要回退时，先备份新 MySQL 数据，再停止网关与 Java 服务，将 `apps/risk-platform` 链接改指向 `risk-platform-backups/legacy-app-20260920`，然后执行旧目录内的 `deploy/hexiang-start.sh`。

旧 Node 版本不读取新 MySQL；回退不会自动带回切换后新增或修改的数据，需要单独迁移，不能覆盖现有数据库或旧 JSON 文件。

## 已验证

- 本地 `mvn test package`：21 项测试全部通过。
- 原 3 个账号的用户名、密码哈希和启用状态逐项一致。
- 临时账号注册、登录、管理员授权及清理。
- 站点与设备登记、单条上报、重复消息去重、最新值与历史查询。
- 后台定时模拟持续产生记录，停止后运行任务数为 0。
- 前端页面与静态资源可访问；配置、后端源码和部署脚本不能通过网关下载。
- 原地址切换成功，浏览器登录页可打开。
- 真实设备独立密钥、HTTP 持续上报、重复消息重试和错误凭证日志通过服务器实测。
- 管段关系、CSV 暂存校验、数据集发布及清理通过服务器 MySQL 5.7 实测。

此版本供功能验收；尚未完成整体权限加固、容量压测和服务器重启演练，不代表已达到正式生产验收标准。
