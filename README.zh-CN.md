# 工作台模板

让 Codex、Claude Code 等外部 AI 工具创建工作台。无需安装 Floatboat，就能运行真实 React 页面、Node HTTP 服务和 SQLite。仓库托管在 [floatboatai/floatboat-workbench-template](https://github.com/floatboatai/floatboat-workbench-template)，目前为私有仓库，暂不开源，也未选择开源许可证；详见 [公开状态](PUBLICATION.md)。

## 创建和预览

准备 Node 22.16+（22.x）和 pnpm 10.22.0，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm workbench:init -- --registry project-tracker --name "项目工作台" --description "管理项目与跟进事项"
pnpm workbench:check
pnpm test
pnpm dev
```

打开终端输出的完整地址。Ctrl+C 停止；源码改动后重新运行 `pnpm dev`。首版不提供热更新。预览数据保存在忽略的 `.local/data/`，重启不会清空，打包不会带上这些数据。

给外部 AI 的提示词：

> 阅读 AGENTS.md，为我创建一个用于［用户与业务目标］的工作台。先补充 app/REQUIREMENTS.md，在 app/ 中实现业务流程，同时维护 manifest。完成检查、测试和真实浏览器预览验证。

Codex 读取根 `AGENTS.md`，Claude Code 通过 `CLAUDE.md` 引用同一份指引。其他工具可明确要求读取它；不依赖 Floatboat 专用 MCP。

## 交付

执行 `pnpm workbench:pack`，在 `artifacts/` 得到 `.fbworkbench` 源码应用包。相同文件已存在时会拒绝覆盖，可指定新的绝对路径。导入 Floatboat 后会重建并创建独立空间；不会覆盖原有工作台，也不会自动上架。

本地页面、服务和数据库真实可用；模型、Agent、ASR、工作流、日程等平台调用尚未连接时返回 `HOST_NOT_CONNECTED`。通过 Floatboat 导入、信任与授权后再验收这些能力，见 [平台边界](docs/platform.md)。

[manifest 约定](docs/manifest.md) · [维护与版本](docs/maintenance.md) · [Agent 指引](AGENTS.md)
