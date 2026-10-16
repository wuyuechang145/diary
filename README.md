# 星笺

一个可以在本地运行的日记与家庭共鸣网站。

## 快速开始

请先安装并启动 Docker，然后在命令行执行：

```bash
git clone https://github.com/wuyuechang145/diary.git
cd diary
cp .env.example .env
docker compose up -d
```

Windows PowerShell 复制配置文件可使用：

```powershell
Copy-Item .env.example .env
```

启动完成后打开：

<http://localhost:3000>

停止网站：

```bash
docker compose down
```

本地数据会继续保留，下次执行 `docker compose up -d` 即可再次使用。
