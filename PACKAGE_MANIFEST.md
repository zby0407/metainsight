# MetaInsight 可运行成果包清单

- 重新打包：2026-08-28（Asia/Shanghai）
- 源码来源：本机演示工程 `deerflow-dsa-complete-20260729-110557`（与 `http://localhost:2026` 同一套代码）
- 归档文件：`MetaInsight 元策-项目成果.zip`
- 顶层目录：`智能投研系统-20260730`

## 目录内容

- `deer-flow/`：Agent 引擎、工作台前端、Gateway、Compose 与当前 `.env` / `config.yaml`
- `daily-stock-analysis/`：DSA 行情与收盘分析引擎及 `.env`
- `integration-assets/`：双引擎集成配置与资产
- `runtime-backups/`：运行配置备份
- `docs-assets/`：界面截图（落地页/登录/行情/自选/会话/通知）
- `README-打包说明.md`、`DIGEST_PUSH_README.md`

## 有意排除

可由锁文件 / Docker 重建，或含个人运行数据：

- `deer-flow/frontend/node_modules/`、`.next/`、`docker-dist/`
- `deer-flow/backend/.venv/`、`backend/.deer-flow/`
- `daily-stock-analysis/data/`、`logs/`、`longbridge_tokens/`、`node_modules/`
- `__pycache__`、pytest / ruff / Playwright 临时缓存

## 使用提示

```bash
cd 智能投研系统-20260730/deer-flow
docker compose -p deer-flow -f docker/docker-compose.yaml up -d
```

浏览器打开 http://localhost:2026

## 安全提醒

包内含百炼 API Key 与登录 Secret。仅在受信任环境使用，不要上传到公开网盘或公开 Git。
