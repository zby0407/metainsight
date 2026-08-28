# 智能投研系统 · 可运行成果包

- 更新时间：2026-08-28（Asia/Shanghai）
- 内容：Agent 引擎（deer-flow/）、股票市场数据源引擎（daily-stock-analysis/）、集成资产（integration-assets/）、运行配置备份（runtime-backups/）、界面截图（docs-assets/）

本包与当前演示机 **MetaInsight** 源码对齐。**已放入正在使用的 `.env`（含百炼 API Key 与登录 Secret）**。解压后按下面步骤启动，浏览器打开的页面与本机 `http://localhost:2026` 为同一套系统。

> 解压看到的是源码，不是网页。必须先用 Docker 启动，再在浏览器访问。

## 本版相对上一包（2026-08-25）的源码对齐

- 欢迎页/对话页左上角 **对话记录**（侧栏不再列历史会话）
- 首次登录风险测评写入系统记忆（`[investor-risk-profile]`），改仓须遵守现金底仓与单票上限
- 深蓝工作台、通知实时刷新、组合按行情盯市（浮动收益/当日盈亏/回撤/波动率）

## 已放入的运行配置

| 文件 | 作用 |
|---|---|
| `deer-flow/.env` | 百炼 `DASHSCOPE_API_KEY` / `DSA_DASHSCOPE_API_KEY`、`BAILIAN_*`、登录 `BETTER_AUTH_SECRET` |
| `deer-flow/config.yaml` | 模型走 `$DSA_DASHSCOPE_API_KEY`，无需再改 |
| `daily-stock-analysis/.env` | DSA 收盘分析用的 DashScope 渠道 |
| `deer-flow/frontend/.env` | 前端走相对路径 `/api`，与现网一致 |
| `integration-assets/deer-flow/runtime-fix/.env` | 运行修复备份 |

未放入本机聊天记录、自选库、SQLite 会话（体积大、含个人运行数据）。界面与现网源码一致；首次启动会走初始化，需注册管理员。

本机当前演示账号（仅当沿用本机已有数据目录时有效）：`admin@example.com`

## 快速开始（与现网页一致）

在已安装 Docker Desktop 的电脑上：

```bash
cd 智能投研系统-20260730/deer-flow
docker compose -p deer-flow -f docker/docker-compose.yaml up -d
```

浏览器打开：**http://localhost:2026**

- 首次启动：按页面完成管理员注册与风险测评，进入后即为当前这套 MetaInsight 工作台。
- DSA 行情引擎（可选，自选/收盘分析）：`cd daily-stock-analysis && docker compose -f docker/docker-compose.yml up -d`

不要改 `DEERFLOW_FINANCE_BRIDGE_SECRET`。留空时组合复盘走本地存储，与现网一致。

## 仍未放入（不影响页面源码）

| 排除项 | 原因 |
|---|---|
| `deer-flow/backend/.deer-flow/` | 本机会话、cookies、用户库 |
| `daily-stock-analysis/data/`、`logs/`、`longbridge_tokens/` | 运行数据库、日志与令牌缓存 |
| `frontend/node_modules`、`frontend/.next`、`frontend/docker-dist`、`backend/.venv`、`__pycache__` | 启动时由 Docker / 锁文件重建 |

## 安全提醒

包内含可用的百炼 API Key 和登录 Secret。只在本队/评委受信任环境使用，不要传到公开网盘、公开 Git 仓库或公共镜像。赛后如需换钥，到阿里云百炼控制台重置即可。
