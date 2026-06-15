\# API Specification



\## Product



Nexus



Universal AI Integration Platform



Version: MVP v1



\---



\# Base URL



```text

https://api.nexus.dev

```



Versioning:



```text

/v1

```



Example:



```text

https://api.nexus.dev/v1

```



\---



\# Authentication



All requests require:



```http

Authorization: Bearer API\_KEY

```



or



```http

Authorization: Bearer JWT\_TOKEN

```



\---



\# Health Check



\## GET /v1/health



Response:



```json

{

&#x20; "status":"ok"

}

```



\---



\# Workspace APIs



\---



\## GET /v1/workspaces



Returns user workspaces.



Response:



```json

\[

&#x20; {

&#x20;   "id":"workspace\_123",

&#x20;   "name":"My Workspace"

&#x20; }

]

```



\---



\## POST /v1/workspaces



Create workspace.



Request:



```json

{

&#x20; "name":"Engineering Team"

}

```



\---



\# Connection APIs



\---



\## GET /v1/connections



Returns active connections.



Response:



```json

\[

&#x20; {

&#x20;   "connector":"gmail",

&#x20;   "status":"connected"

&#x20; }

]

```



\---



\## POST /v1/connections/connect



Create OAuth connection.



Request:



```json

{

&#x20; "connector":"gmail"

}

```



Response:



```json

{

&#x20; "authorizationUrl":"..."

}

```



\---



\## DELETE /v1/connections/:id



Disconnect service.



\---



\# Tool APIs



\---



\## GET /v1/tools



List tools.



Response:



```json

\[

&#x20; {

&#x20;   "name":"gmail\_send\_email",

&#x20;   "connector":"gmail"

&#x20; }

]

```



\---



\## GET /v1/tools/:tool



Get tool details.



Response:



```json

{

&#x20; "name":"gmail\_send\_email",

&#x20; "schema":{}

}

```



\---



\# Execution APIs



\---



\## POST /v1/tools/execute



Execute tool.



Request:



```json

{

&#x20; "tool":"gmail\_send\_email",

&#x20; "arguments":{

&#x20;   "to":"john@gmail.com",

&#x20;   "subject":"Hello",

&#x20;   "body":"Test"

&#x20; }

}

```



Response:



```json

{

&#x20; "executionId":"exec\_123",

&#x20; "status":"queued"

}

```



\---



\## GET /v1/executions/:id



Get execution result.



Response:



```json

{

&#x20; "id":"exec\_123",

&#x20; "status":"success",

&#x20; "durationMs":1243

}

```



\---



\## GET /v1/executions



List executions.



Response:



```json

\[

&#x20; {

&#x20;   "id":"exec\_123",

&#x20;   "tool":"gmail\_send\_email",

&#x20;   "status":"success"

&#x20; }

]

```



\---



\# API Key APIs



\---



\## GET /v1/api-keys



List keys.



\---



\## POST /v1/api-keys



Create key.



Request:



```json

{

&#x20; "name":"Production"

}

```



Response:



```json

{

&#x20; "key":"nx\_live\_xxxxx"

}

```



Important:



Key shown once.



\---



\## DELETE /v1/api-keys/:id



Delete key.



\---



\# MCP APIs



\---



\## POST /v1/mcp/tools/list



List MCP tools.



Response:



```json

\[

&#x20; {

&#x20;   "name":"gmail\_send\_email"

&#x20; }

]

```



\---



\## POST /v1/mcp/tools/call



Execute MCP tool.



Request:



```json

{

&#x20; "tool":"gmail\_send\_email",

&#x20; "arguments":{}

}

```



Response:



```json

{

&#x20; "result":{}

}

```



\---



\# Workflow APIs



Phase 2



\---



\## POST /v1/workflows



Create workflow.



\---



\## GET /v1/workflows



List workflows.



\---



\## POST /v1/workflows/:id/run



Execute workflow.



\---



\# Admin APIs



Future.



\---



\## GET /v1/admin/connectors



\---



\## GET /v1/admin/tools



\---



\## GET /v1/admin/executions



\---



\# Error Format



All errors follow:



```json

{

&#x20; "error":{

&#x20;   "code":"TOOL\_NOT\_FOUND",

&#x20;   "message":"Tool does not exist"

&#x20; }

}

```



\---



\# Common Error Codes



```text

INVALID\_REQUEST



UNAUTHORIZED



FORBIDDEN



WORKSPACE\_NOT\_FOUND



CONNECTOR\_NOT\_CONNECTED



TOOL\_NOT\_FOUND



EXECUTION\_FAILED



RATE\_LIMITED



INTERNAL\_ERROR

```



\---



\# Rate Limits



Default:



```text

100 requests/minute

```



Per workspace.



\---



\# API Design Rules



1\. All endpoints versioned.



2\. All responses JSON.



3\. All errors standardized.



4\. Every execution has an executionId.



5\. Every action is auditable.



6\. MCP and REST APIs share the same execution engine.



7\. No endpoint may bypass the Execution Engine.



