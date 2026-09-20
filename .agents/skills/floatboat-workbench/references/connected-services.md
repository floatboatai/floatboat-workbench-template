# 三方服务的创作与授权

创建需要 Gmail 等 Connector 的工作台时，先完成服务发现，再生成授权按钮；终端用户不需要自己去商店搜索服务。

1. 调用 `connected_service_use`，`action="search_providers"`、`query="gmail"`。目录包含尚未连接的服务，读取返回的 provider 标识，不猜名称。
2. 用 `search_catalog_actions` 传 provider/query 查操作，再用 `describe_catalog_action` 传精确 capability 读取输入输出 schema。创作查询不授予运行权限；`list_providers` 与原有 `search_capabilities` 仍面向已连接服务。
3. 在 manifest 声明业务逻辑名与服务，例如：

```json
{
  "capabilities": ["connected-services"],
  "connectedServices": [{ "id": "mail", "provider": "connector:gmail" }]
}
```

4. 页面通过自己的 API 调用服务端 SDK。读取 `app.host.connectedServices.getConnection({service:'mail'})` 展示当前绑定；用户点击“连接 Gmail”时调用 `requestConnection({service:'mail'})`，取得 requestId 后轮询 `getConnectionRequest({requestId})`。Host 原位提供账号选择或指定 Connector 授权窗口。`requested` 只是排队，只有 `connected` 才代表成功；取消、失败、过期都停止等待并允许重试。用户取消等待可调用 `cancelConnectionRequest`。页面应保留 requestId 以便请求结果未知时继续查询，避免重复打开授权。
5. 服务端也可用 `connect({service:'mail'}, {signal,timeoutMs})` 等待终态；普通页面 API 推荐分步请求与查询，避免长时间占用 HTTP 请求。connect 只适用于声明的 Connector 服务；旧原生 provider 的 requestConnection 仍是设置跳转。
6. 执行业务时使用 `call({service:'mail',capability,params})`。Host 按当前 App/Floatboat 账号读取绑定，再检查真实连接和操作权限。授权完成后只刷新状态，发送邮件等业务操作需用户另行触发或已有明确授权。

connectionId 是用户选择后的账号引用，可用于旧的显式连接调用；不要把开发者的 connectionId 写进源码、manifest、示例数据或导出包。声明可以分发，绑定由 Host 单独保存。更换账号通过再次请求连接并选择完成。

独立预览会自动连接运行中的 Floatboat，通过同一 SDK 执行发现与端内授权；客户端未连接时返回 HOST_NOT_CONNECTED。外部创作工具若没有已授权的 Floatboat MCP 发现入口，先实现声明/UI 与不可用状态，明确标记真实 Connector 契约和授权验证尚未完成，不借用其他产品工具的 provider 标识。新版接口需要支持本协议的 Host；旧工程先 refresh-sdk，再 check/open。调用返回 unknown 的业务结果按实际 schema 校验；结果未知的外部写操作不自动重试。
