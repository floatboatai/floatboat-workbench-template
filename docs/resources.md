# 依赖与文件资源

业务代码新增 Workflow、Combo Skill 或文件依赖时，同时维护 `manifest.json`。Host 管理实际安装 ID 和绝对路径；清单只保留稳定逻辑名称。能力声明仍需 `capabilities: ["workflows", "agent"]` 等真实使用项，声明不会获得账户授权。

```json
{
  "dependencies": [
    { "id": "extract", "kind": "workflow", "source": { "type": "bundle", "path": "dependencies/extract.workflow.js" } },
    { "id": "research", "kind": "combo", "source": { "type": "binding" }, "required": false }
  ],
  "resources": [
    { "id": "templates", "kind": "directory", "role": "asset", "location": "project", "path": "templates" },
    { "id": "attachments", "kind": "directory", "role": "data", "location": "data", "path": "attachments", "access": "read-write" },
    { "id": "contracts", "kind": "directory", "role": "data", "location": "external", "access": "read", "transfer": "snapshot" },
    { "id": "shared-drive", "kind": "directory", "role": "data", "location": "external", "transfer": "rebind", "required": false }
  ]
}
```

`id` 使用小写字母起始的英文字母、数字和连字符，最长 64。`required` 默认 true。依赖支持 `workflow` 和 `combo`；`source.type` 为：

- `bundle`：工程相对路径下的普通 `.workflow.js` 或可分发 Owned `.aoe`。Host 使用原领域入口创建独立身份，精确内容可以复用，不覆盖不同内容的已有安装。
- `binding`：在工作台管理菜单的“依赖与资源”选择已安装项。绑定固定当前内容；源码变化后重新选择或准备，不能悄悄继续使用旧锁。
- `registry`：例如 `{ "type": "registry", "name": "research-assistant", "version": "1.2.3" }`。受限包只传引用，用户在接收端准备依赖时走原商店授权。精确版本不可用或冲突时保持待配置，不退回最新版。

`requires: ["child-id"]` 描述传递依赖；所有引用必须在清单中声明，禁止循环。Host 不扫描任意脚本推断动态依赖。服务端调用 `app.host.workflows.start({ dependency: "extract", input: {}, idempotencyKey })`。已声明 dependencies 的工程必须使用逻辑引用；旧工程仍兼容 name。嵌套 Workflow 的调用名称使用其清单逻辑标识，并在父依赖 requires 中列出，Host 将其解析为固定 ID/摘要。Combo 通过工作台的 Agent 任务加载，缺少必需项时不启动任务。

资源 `role: asset` 为只读固定资源，放在 project 或显式 external 绑定；`role: data` 放在 data 或 external。project/data 使用相对 path，external 不写 path，由用户在 Host 选择。默认 transfer=snapshot，外部目录可以设 rebind；不递归跟随符号链接。不要把用户 Home、Workspace cwd 或任意数据库表中的路径自动纳入导出。

服务端使用 `await app.resources.path("contracts", "customer/report.pdf")`；创建文件使用 `await app.resources.path("attachments", "report.pdf", "write")`，随后调用 Node fs。业务记录保存资源 ID 与相对路径。`app.resources.configured(id)` 只表示存在映射，实际文件存在性由 path 检查；可选项要设计未配置状态。路径 API 不是 Node 进程的 OS 沙箱。

普通应用包包含固定资源和可分发依赖；“包含业务数据”增加正式 SQLite、受管附件及已登记快照资源，无数据库也能导出。不包含数据时，受管业务目录恢复为空目录；单文件和 rebind 必需项未就绪时保持待配置。外部文件快照期间检测到变化会失败，需要稳定文件后重试。`workbench.lock.json` 由 Host 导出生成，记录包内位置、精确版本和摘要，不手写本机路径或凭据。新的文件包格式为 v2，旧 v1 包仍可读。

导入不转移登录、密钥、模型配置、运行中的任务、自动触发绑定或 Workflow 的 Host 内部状态表。业务数据放在工作台数据库/已登记文件中，其他领域状态需要该领域单独的迁移契约。独立预览只支持工程/数据相对资源；外部目录及平台依赖在 Floatboat 中绑定。

验证至少包含：缺失必需项阻断；不含/包含业务数据各一次导出；导入新空间后从新路径读取；相同名称不同内容的依赖不被覆盖；原目录仍在。`check_workbench_project` 会报告待配置项；编译通过不等于业务依赖可用。
