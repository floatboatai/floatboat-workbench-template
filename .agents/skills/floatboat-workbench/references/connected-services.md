# Connected services

Declare `connected-services`; keep calls on the server. In a connected Host, inspect `app.host.capabilities.list()` and discover the actual business operations:

1. `connectedServices.search({ provider?, query?, domain?, pageSize?, pageToken? })` finds available operations.
2. `describe({ capability })` returns that operation's actual schema. Validate the unknown response and use its real parameter contract instead of guessing names.
3. `listConnections({ provider })` supplies explicit connectionId choices. If needed, `requestConnection({ provider })` opens the Host connection flow; requesting it does not mean authorization has completed.
4. `call({ capability, connectionId, params })` uses the chosen account and current permission checks.

Capability existence does not prove the current account may call it. A workspace/account preference is not an application binding. Do not read Host tokens or pass them through the browser. A disconnected local preview returns HOST_NOT_CONNECTED. Failed calls with unknown external execution state need reconciliation; the SDK does not blindly retry writes. See `sdk/host-contracts.mts` and the live describe result for the contract.
