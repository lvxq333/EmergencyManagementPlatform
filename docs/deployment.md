# 本机重建与部署说明

日期：2026-06-22

## 1. 端口规划

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Nginx | `http://localhost:8080` | 对外入口，提供前端页面并转发 API |
| Java Spring Boot / Tomcat | `http://127.0.0.1:8081` | 后端接口服务 |
| MySQL | `localhost:3306` | 用户、角色、权限、告警、快照持久化 |
| Redis | `localhost:6379` | 实时风险态势缓存 |

前端页面只请求 `/api/...`，由 Nginx 转发到 Java 后端。

## 2. 数据库初始化

进入项目根目录：

```bash
cd /Users/haibolv/Documents/实验室/网页页面/平台开发01
```

执行 schema：

```bash
mysql -uroot -p < backend-java/src/main/resources/schema.sql
```

如果你的 MySQL 密码、端口或数据库名不同，请按本机环境调整。

## 3. Redis

启动 Redis 后确认：

```bash
redis-cli ping
```

期望输出：

```text
PONG
```

后端在 Redis 不可用时会用内存状态兜底，但生产或完整联调建议启动 Redis。

## 4. 启动 Java 后端

```bash
cd /Users/haibolv/Documents/实验室/网页页面/平台开发01/backend-java
mvn package
java -jar target/risk-platform-backend-1.0.0.jar
```

常用环境变量：

```bash
SERVER_PORT=8081
DB_URL='jdbc:mysql://localhost:3306/risk_platform_db?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai'
DB_USER=root
DB_PASSWORD='你的MySQL密码'
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET='至少32位的本地密钥'
```

如果只是先验证前端看板和风险接口，而本机暂时没有启动 MySQL 或 Redis，可以关闭实时缓存和风险快照落库：

```bash
REDIS_ENABLED=false PERSIST_RISK_EVENTS=false \
java -jar target/risk-platform-backend-1.0.0.jar
```

也可以直接开发启动：

```bash
mvn spring-boot:run
```

## 5. 启动 Nginx

使用项目内配置：

```bash
nginx -p /Users/haibolv/Documents/实验室/网页页面/平台开发01 -c nginx/risk-platform.conf
```

停止或重载：

```bash
nginx -p /Users/haibolv/Documents/实验室/网页页面/平台开发01 -c nginx/risk-platform.conf -s stop
nginx -p /Users/haibolv/Documents/实验室/网页页面/平台开发01 -c nginx/risk-platform.conf -s reload
```

访问：

```text
http://localhost:8080/login.html
```

## 6. 接口验证

直连后端：

```bash
curl http://127.0.0.1:8081/api/risk/overview
```

通过 Nginx：

```bash
curl http://localhost:8080/api/risk/overview
```

## 7. FoxAPI 导入

FoxAPI 导入文件：

```text
docs/foxapi-openapi.json
```

导入时选择 OpenAPI / Swagger 文件导入即可。

## 8. 项目结构

```text
平台开发01/
  login.html
  register.html
  index.html
  home.html
  用户管理控制台.html
  backend-java/
    pom.xml
    src/main/java/com/risk/platform/
    src/main/resources/application.yml
    src/main/resources/schema.sql
  nginx/
    risk-platform.conf
  docs/
    接口文档.md
    foxapi-openapi.json
    deployment.md
```

## 9. hexiang 服务器部署（旧 Node 版本）

2026-09-20 已切换为 Java 后端与独立 MySQL，当前访问方式、运维命令和回退说明见 [服务器验收部署](server-acceptance.md)。以下保留旧版记录。

服务器部署使用 Node.js 统一提供静态前端和 `/api` 接口，对外地址为：

```text
http://10.21.255.108:18080/login.html
```

由于 `hexiang` 没有公共 MySQL 的管理权限，服务器版本使用
`server-file.js` 将用户、角色和权限数据持久化到该账户的私有目录：

```text
/home/data/home/workspace/hexiang/apps/risk-platform-data/platform.json
```

服务器路径与运维命令：

```bash
# 项目目录
cd /home/data/home/workspace/hexiang/apps/risk-platform

# 查看运行状态
ps -p "$(sed -n '1p' ../risk-platform-runtime/app.pid)" -o pid=,etime=,cmd=

# 查看日志
tail -f ../risk-platform-runtime/app.log

# 重启
kill "$(sed -n '1p' ../risk-platform-runtime/app.pid)"
./deploy/hexiang-start.sh
```

运行密钥存放在 `$HOME/.config/risk-platform/server.env`，权限为 `600`，
不会放在可公开访问的站点目录或 Git 仓库中。
