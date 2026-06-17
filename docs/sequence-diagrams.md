\# Sequence Diagrams



\## Purpose



Defines request-by-request interactions between platform services.



\---



\# Sequence 1 — Gmail Send Email



```text

User

&#x20;│

&#x20;│ Send email to John

&#x20;▼



LLM

&#x20;│

&#x20;│ Tool Call

&#x20;▼



MCP Runtime

&#x20;│

&#x20;│ Execute Tool

&#x20;▼



API Gateway

&#x20;│

&#x20;│ Validate Request

&#x20;▼



Tool Registry

&#x20;│

&#x20;│ Get Tool Definition

&#x20;▼



Connection Service

&#x20;│

&#x20;│ Get OAuth Token

&#x20;▼



Execution Engine

&#x20;│

&#x20;│ Execute

&#x20;▼



Gmail Connector

&#x20;│

&#x20;│ HTTP Request

&#x20;▼



Google API

&#x20;│

&#x20;│ Success

&#x20;▼



Gmail Connector

&#x20;│

&#x20;▼



Execution Engine

&#x20;│

&#x20;▼



MCP Runtime

&#x20;│

&#x20;▼



LLM

&#x20;│

&#x20;▼



User

```



\---



\# Sequence 2 — OAuth Connection



```text

User

&#x20;│

&#x20;▼



Dashboard

&#x20;│

&#x20;│ Connect Gmail

&#x20;▼



OAuth Service

&#x20;│

&#x20;▼



Google OAuth

&#x20;│

&#x20;│ Consent

&#x20;▼



User

&#x20;│

&#x20;▼



Google OAuth

&#x20;│

&#x20;│ Authorization Code

&#x20;▼



OAuth Service

&#x20;│

&#x20;│ Exchange Code

&#x20;▼



Google OAuth

&#x20;│

&#x20;│ Access Token

&#x20;▼



OAuth Service

&#x20;│

&#x20;│ Save Token

&#x20;▼



Database

```



\---



\# Sequence 3 — MCP Tool Discovery



```text

Claude



&#x20;│



&#x20;▼



MCP Runtime



&#x20;│



&#x20;▼



Workspace Service



&#x20;│



&#x20;▼



Connection Service



&#x20;│



&#x20;▼



Tool Registry



&#x20;│



&#x20;▼



MCP Runtime



&#x20;│



&#x20;▼



Claude

```



\---



\# Sequence 4 — Workflow Execution



```text

Workflow



&#x20;│



&#x20;▼



Workflow Engine



&#x20;│



&#x20;▼



Execution Engine



&#x20;│



&#x20;▼



Connector



&#x20;│



&#x20;▼



Provider



&#x20;│



&#x20;▼



Execution Engine



&#x20;│



&#x20;▼



Workflow Engine



&#x20;│



&#x20;▼



Next Step

```



\---



\# Sequence 5 — Future Agent Execution



```text

User



&#x20;│



&#x20;▼



Planner Agent



&#x20;│



&#x20;▼



Task Graph



&#x20;│



&#x20;┌───────────────┐

&#x20;│               │



&#x20;▼               ▼



Research      Executor



&#x20;│               │



&#x20;└───────┬───────┘



&#x20;        ▼



&#x20;     Reviewer



&#x20;        ▼



&#x20;    Final Result

```



