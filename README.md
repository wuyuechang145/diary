# 星笺（Xingjian）

星笺是一个可在本机运行的匿名日记与家庭共鸣网站。项目已包含 Nuxt 服务、MySQL 和 Redis 的 Docker 编排；首次启动时会自动生成本地数据库密码、Redis 密码和会话密钥，因此仅用于本地体验时无需手工填写密钥。

## 一键本地运行

### 环境要求

- Docker Desktop，或 Docker Engine + Docker Compose v2
- 本机端口 `3000` 未被占用

### 1. 下载项目

```bash
git clone https://github.com/<你的GitHub用户名>/<仓库名>.git
cd <仓库名>
```

### 2. 复制环境变量模板

macOS / Linux：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

用于本地体验时，复制后可以直接使用，不需要填写 MySQL、Redis 或会话密钥。Docker 会在首次启动时自动生成这些值，并保存到仅属于本项目的 Docker 卷中。

AI 诗意标题是可选功能。未配置 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_MODEL` 时，网站其余注册、登录、写日记和阅读功能仍可正常使用。

### 3. 启动

```bash
docker compose up -d
```

第一次启动需要构建镜像并初始化数据库，所需时间取决于电脑和网络速度。容器启动后访问：

<http://localhost:3000>

查看运行状态：

```bash
docker compose ps
```

查看应用日志：

```bash
docker compose logs -f app
```

## 停止、更新与清理

停止容器但保留数据：

```bash
docker compose down
```

拉取最新代码并重新构建：

```bash
git pull
docker compose up -d --build
```

用户账户、日记和数据库数据保存在 Docker 命名卷中，普通的 `docker compose down` 不会删除它们。不要执行下面的命令，除非你确认要清空全部本地数据：

```bash
docker compose down -v
```

项目使用的主要卷包括：

- `xingjian_mysql-data`：MySQL 用户与日记数据
- `xingjian_redis-data`：Redis 数据
- `xingjian_secrets-data`：自动生成的本地服务密钥

## 修改访问端口

如果 `3000` 端口已被占用，请编辑 `.env`，同时修改以下两项，例如：

```dotenv
APP_PORT=3080
DOCKER_PUBLIC_ORIGIN=http://localhost:3080
```

然后重新启动：

```bash
docker compose up -d
```

访问 <http://localhost:3080>。

## API 密钥安全

- `.env`、`docker.env` 和其他 `.env.*` 实际配置文件默认不会被 Git 提交。
- 这些文件也被排除在 Docker 构建上下文之外，不会被复制进应用镜像。
- 仓库只保留 `.env.example`，其中应只有空白占位符，不能填写真实密钥。
- 不要运行 `git add -f .env`，它会绕过忽略规则。
- 提交前建议执行 `git status --short --ignored` 和 `git diff --cached --name-only`，确认暂存区中没有 `.env`、私钥或凭据文件。

如果真实密钥曾经被提交过，仅从文件中删除并不够；应立即在对应服务后台撤销旧密钥、创建新密钥，并清理 Git 历史。

## 使用范围

当前 Docker 编排默认绑定到本机，适合个人体验和开发测试。若要公开部署到互联网，还应配置 HTTPS、域名、备份、日志监控、邮件验证、内容举报审核和更严格的限流策略。
