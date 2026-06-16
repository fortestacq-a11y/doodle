\# MCP Runtime



\## Product



Nexus



Universal AI Integration Platform



\---



\# Purpose



The MCP Runtime exposes Nexus tools to AI systems using the Model Context Protocol (MCP).



The MCP Runtime allows:



\* Claude Code

\* Cursor

\* OpenCode

\* Roo

\* OpenAI Agents

\* Custom AI Systems



to discover and execute tools without understanding connector implementations.



\---



\# Core Principle



AI systems should only know:



```json

{

&#x20; "name": "gmail\_send\_email"

}

```



They should never know:



```text

OAuth



Google APIs



GitHub APIs



Slack APIs



Token Refresh

```



The MCP Runtime abstracts these details.



\---



\# Architecture



```text

AI Client



&#x20;│



&#x20;▼



MCP Runtime



&#x20;│



&#x20;▼



Tool Registry



&#x20;│



&#x20;▼



Execution Engine



&#x20;│



&#x20;▼



Connector Runtime

```



\---



\# Responsibilities



The MCP Runtime is responsible for:



\* Tool Discovery

\* Tool Exposure

\* Session Management

\* Permission Enforcement

\* Tool Invocation Routing



The MCP Runtime is NOT responsible for:



\* OAuth

\* Connector Logic

\* API Execution

\* Token Storage



\---



\# Supported Clients



Examples:



```text

Claude Code



Cursor



OpenCode



Roo



OpenAI Agents



Custom Agents

```



\---



\# Supported Transports



\## HTTP



Example:



```http

POST /mcp/tools/call

```



\---



\## WebSocket



Persistent sessions.



Used for:



```text

Long conversations



Agent interactions



Streaming results

```



\---



\## STDIO



Future support.



Used by:



```text

Local MCP Servers



Desktop Agent Tools

```



\---



\# MCP Tool Discovery



Client requests:



```json

{

&#x20; "method": "tools/list"

}

```



\---



Nexus returns:



```json

\[

&#x20; {

&#x20;   "name":"gmail\_send\_email",

&#x20;   "description":"Send email via Gmail"

&#x20; },

&#x20; {

&#x20;   "name":"github\_create\_issue",

&#x20;   "description":"Create GitHub issue"

&#x20; }

]

```



Source:



```text

Tool Registry

```



\---



\# Tool Call Flow



Client sends:



```json

{

&#x20; "tool":"gmail\_send\_email",

&#x20; "arguments":{

&#x20;   "to":"john@gmail.com",

&#x20;   "subject":"Project Update"

&#x20; }

}

```



\---



Flow:



```text

MCP Runtime



↓



Execution Engine



↓



Connector Runtime



↓



Google API



↓



Response

```



\---



\# Workspace Isolation



Every MCP session belongs to:



```text

Workspace

```



Example:



```text

Workspace A



&#x20;Gmail

&#x20;GitHub



Workspace B



&#x20;Slack

&#x20;Notion

```



Tool visibility depends on workspace permissions.



\---



\# Tool Filtering



Only expose tools that:



```text

Workspace Can Access



Connector Is Connected



Tool Is Active

```



Example:



If Gmail is not connected:



```text

gmail\_send\_email

```



will not appear.



\---



\# Session Lifecycle



Connection:



```text

Client Connects



↓



Session Created



↓



Workspace Resolved



↓



Tools Loaded

```



\---



Disconnection:



```text

Session Closed



↓



Resources Released

```



\---



\# Permissions



Before exposing a tool:



Check:



```text

Workspace



Connector



User Permissions



Tool Status

```



\---



\# Error Handling



Examples:



```text

TOOL\_NOT\_FOUND



TOOL\_DISABLED



WORKSPACE\_INVALID



PERMISSION\_DENIED



CONNECTOR\_UNAVAILABLE

```



\---



\# Future MCP Features



Phase 2:



```text

Tool Categories



Tool Search



Tool Recommendations

```



\---



Phase 3:



```text

Dynamic Tool Loading



Agent Context Injection



Workflow Exposure

```



\---



\# Design Rule



MCP Runtime discovers and routes tools.



Execution Engine executes tools.



These responsibilities must remain separate.



