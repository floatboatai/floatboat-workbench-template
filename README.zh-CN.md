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

打开终端输出的完整地址。`pnpm dev` 会监听源码保存，在独立快照上校验，通过后安全重启服务并自动刷新同一页面。校验失败继续使用旧版本；启动失败恢复旧服务和数据。页面临时状态可能重置。Ctrl+C 停止；预览数据保存在忽略的 `.local/data/`，重启不会清空，打包不会带上这些数据。单次预览可用 `pnpm dev -- --no-watch`；修改模板 SDK、工具链或安装依赖后需重启命令。

给外部 AI 的提示词：

> 阅读 AGENTS.md，为我创建一个用于［用户与业务目标］的工作台。先补充 app/REQUIREMENTS.md，在 app/ 中实现业务流程，同时维护 manifest。完成检查、测试和真实浏览器预览验证。

仓库内置 `floatboat-workbench` Skill，覆盖现有工作台创建指导的 16 个主题。在此仓库中新开会话后，可以这样使用：

- Codex：`$floatboat-workbench 为我创建一个项目管理工作台`。
- Claude Code：`/floatboat-workbench 为我创建一个项目管理工作台`。
- 其他工具：明确要求读取 [.agents/skills/floatboat-workbench/SKILL.md](.agents/skills/floatboat-workbench/SKILL.md)。根 AGENTS.md 也会指向这个入口。

Codex 的入口放在官方支持的 [.agents/skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)；Claude 使用 [.claude/skills](https://code.claude.com/docs/en/skills#where-skills-live) 下生成的薄入口，引用同一份正文。无需安装 Floatboat 或配置其 MCP，就能读取指引和开发本地应用。

也可以按主题读取：

```sh
pnpm workbench:guide -- --list
pnpm workbench:guide -- --topic resources
# 尚未安装依赖时，直接用 Node 读取：
node tooling/guide.mjs --topic runtime
```

runtime 主题提供 Host 创建工具与模板本地命令的对应关系；其他主题覆盖工程、页面设计、数据库、依赖资源、模型、Agent、ASR、Workflow、连接服务、日程和自动化。只维护 `.agents` 真源，用 `pnpm skills:sync` 生成 Claude 入口，`pnpm skills:check` 检查主题、链接和入口一致性。

## 交付

在模板仓库根目录执行：

```sh
pnpm run package
# 与上述命令等价，保留现有入口：
pnpm workbench:pack
# 可指定新的绝对路径：
pnpm run package -- --output /absolute/path/project-tracker.fbworkbench
```

命令会校验源码，在 `artifacts/` 生成 `.fbworkbench` 并输出完整路径。这是 package.json 中的打包脚本；`pnpm pack` 生成的 npm 归档不能作为工作台导入。

1. 打开 Floatboat → **我的 → 工作台 → 导入工作台**。
2. 选择 `.fbworkbench` 文件，核对内容并确认导入。
3. 客户端自动下载锁定的依赖、构建并初始化新的独立空间；缺少依赖时需要联网。
4. 按客户端提示完成信任、资源绑定和平台服务授权，再打开工作台。

开发及生成文件包无需 Floatboat Agent。导入受客户端兼容性和权限校验约束；入口不可见时见 [平台边界](docs/platform.md)。包内包含源码、迁移、声明的固定资源和可移植 Workflow/Combo 依赖，排除 node_modules、编译产物、SDK 产物、预览业务数据与凭据。相同输出文件已存在时会拒绝覆盖。导入不会覆盖原有工作台，也不会自动上架。

本地页面、服务和数据库真实可用；模型、Agent、ASR、工作流、日程等平台调用尚未连接时返回 `HOST_NOT_CONNECTED`。通过 Floatboat 导入、信任与授权后再验收这些能力，见 [平台边界](docs/platform.md)。

[manifest 约定](docs/manifest.md) · [维护与版本](docs/maintenance.md) · [Agent 指引](AGENTS.md)

## 外部开发时调用 Host 能力

启动支持本连接协议的 Floatboat 并登录后，外部 `pnpm dev` 会自动连接标准工作台 SDK，直接调用 Agent、大模型等能力，无需先导入。客户端后启动或重启也会自动重连；账号权限和 manifest 声明仍然生效。离线调用返回 `HOST_NOT_CONNECTED`。多客户端选择与连接详情见 [平台连接](docs/platform.md)。

模板 SDK 已同步 Floatboat `0.5.10-rc.1` 的工作空间创建与跨空间 Workflow 能力。实现“添加网站账户”时，先读 [workspaces 指引](.agents/skills/floatboat-workbench/references/workspaces.md)：它说明独立登录态、账号与空间关联、幂等恢复、登录检测，以及导航所需的 Floatboat 窗口条件。按实际使用声明 `workspaces`／`workflows`，并查询运行中客户端的能力，连接成功本身不代表登录页已展示。
