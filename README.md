# us-tianqi

美国天气需求地图。这个项目通过实时天气和大模型配置，判断美国各州的当前需求、增量机会、起量前夜和市场下行。

## 快速启动

1. 安装 Node.js 20 或更高版本。
2. 在项目目录里执行 `npm install`。
3. 启动服务：`npm start` 或 `bash ./scripts/start.sh`
4. 打开终端打印出来的地址，通常会从 `http://127.0.0.1:4200/` 开始，如果端口被占用会自动顺延。

## 服务管理

- `npm start`：后台启动本地服务，并记录当前运行端口、进程号和日志。
- `npm run status`：查看当前托管进程、运行端口和健康状态。
- `npm run health`：快速检查当前本地 API 是否可访问。
- `npm run stop`：停止当前托管服务。
- `npm run restart`：重启当前托管服务。

运行时文件会写到 `.runtime/` 目录：

- `.runtime/server.pid`
- `.runtime/active-port.json`
- `.runtime/server.log`

## 说明

- 页面和接口由 `server.mjs` 提供。
- 静态页面、地图、图表和分析都在同一个本地服务里运行。
- 如果你看到空白或残缺页面，优先确认是否访问了 `npm start` 打印出来的实际地址，而不是文件预览或网关预览。
- 本项目不依赖第三方 npm 包，`npm install` 主要用于建立标准 Node 项目结构，方便跨机器使用和后续扩展。
- 推荐始终使用 `npm start` / `npm run restart` 这套托管脚本，而不是直接手动执行 `node server.mjs`。
- 可用 `npm run health` 快速检查本地 API 是否已正常启动。
- 如果用户没有手动填写大模型配置，页面会自动尝试接入当前机器上 OpenClaw 已配置的默认模型。
- 手动填写的 Base URL / 模型 ID / 密钥 仍然优先生效，OpenClaw 只作为兜底来源。

## 主要文件

- [index.html](./index.html)
- [styles.css](./styles.css)
- [app.js](./app.js)
- [server.mjs](./server.mjs)
- [demand-engine.mjs](./demand-engine.mjs)
- [scripts/start.sh](./scripts/start.sh)
- [scripts/health-check.sh](./scripts/health-check.sh)

## 更新说明

- 2026-04-05 版本
- 大模型分析并发提升到 18 路
- 温度、天气、湿度、体感数据均来自开放数据
- 支持用户自行配置大模型
- 支持用户新增自定义类目与赛道，用于分析天气对需求的影响
