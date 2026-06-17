\# Architecture



\## Product



Nexus



Universal AI Integration Platform



\---



\# Architectural Philosophy



The platform is built around one core idea:



AI systems should never directly interact with external applications.



Instead:



```text

AI

&#x20;↓

Nexus

&#x20;↓

External Services

```



Nexus becomes the secure execution layer.



\---



\# High-Level Architecture



```text

&#x20;                    User

&#x20;                      │

&#x20;                      ▼



&#x20;                AI Agent / LLM



&#x20;                      │

&#x20;                      ▼



&#x20;                 MCP Runtime



&#x20;                      │

&#x20;                      ▼



&#x20;                API Gateway



&#x20;                      │



&#x20;       ┌──────────────┼──────────────┐



&#x20;       ▼              ▼              ▼



&#x20;  Auth Service   Tool Registry   Execution Engine



&#x20;                      │

&#x20;                      ▼



&#x20;               Connector Runtime



&#x20;                      │

&#x20;                      ▼



&#x20;              External Services



&#x20;Gmail

&#x20;GitHub

&#x20;Slack

&#x20;Notion

&#x20;Discord

&#x20;Linear

&#x20;HubSpot

&#x20;Salesforce

```



\---



\# Core Components



The platform consists of seven major subsystems.



\---



\# 1. Dashboard



Purpose:



Human interaction layer.



Responsibilities:



\* Manage workspaces

\* Connect applications

\* View executions

\* Manage settings



Technology:



\* Next.js

\* Tailwind

\* shadcn/ui



\---



\# 2. API Gateway



Purpose:



Entry point for all requests.



Responsibilities:



\* Authentication

\* Rate limiting

\* Validation

\* Routing



Technology:



\* Fastify



Examples:



```text

POST /tools/execute



GET /tools



GET /connections

```



\---



\# 3. Auth Service



Purpose:



Identity management.



Responsibilities:



\* User authentication

\* Workspace management

\* API key validation



Technology:



\* Better Auth

\* PostgreSQL



\---



\# 4. Tool Registry



Purpose:



Source of truth for all tools.



Responsibilities:



\* Tool metadata

\* Tool schemas

\* Tool discovery

\* Tool versioning



Example:



```json

{

&#x20; "tool":"gmail\_send\_email",

&#x20; "connector":"gmail",

&#x20; "version":"1.0.0"

}

```



\---



\# 5. Connection Service



Purpose:



Manage user connections.



Responsibilities:



\* OAuth storage

\* Token refresh

\* Connection validation



Stores:



```text

Google Tokens



GitHub Tokens



Slack Tokens



Notion Tokens

```



\---



\# 6. Execution Engine



Purpose:



Execute tool requests.



Responsibilities:



\* Validation

\* Permission checks

\* Retry logic

\* Timeout handling

\* Logging



Example:



```text

gmail\_send\_email

```



becomes



```text

POST gmail.googleapis.com

```



\---



\# 7. Connector Runtime



Purpose:



Provider-specific execution.



Responsibilities:



\* API formatting

\* Request translation

\* Response normalization



Examples:



```text

gmail



github



slack



notion

```



Each connector follows the same interface.



\---



\# Request Lifecycle



```text

User Prompt



↓



LLM Tool Call



↓



MCP Runtime



↓



API Gateway



↓



Tool Registry



↓



Connection Service



↓



Execution Engine



↓



Connector Runtime



↓



External API



↓



Response



↓



LLM



↓



User

```



\---



\# Monorepo Architecture



```text

platform/



apps/

&#x20; dashboard/

&#x20; api/

&#x20; worker/



packages/

&#x20; connector-sdk/

&#x20; mcp-runtime/

&#x20; tool-registry/

&#x20; execution-engine/

&#x20; shared/



services/

&#x20; auth/

&#x20; connections/



connectors/

&#x20; gmail/

&#x20; github/

&#x20; slack/

&#x20; notion/



docs/

```



\---



\# Connector Architecture



Every connector follows:



```text

connector/



manifest.ts



auth.ts



actions/



schemas/



tests/

```



Example:



```text

gmail/



manifest.ts



auth.ts



actions/

&#x20; send-email.ts

&#x20; list-emails.ts



schemas/



tests/

```



\---



\# Data Flow



Tool Call:



```json

{

&#x20; "tool":"gmail\_send\_email"

}

```



↓



Registry Lookup



↓



OAuth Lookup



↓



Execution Engine



↓



Connector Runtime



↓



Google API



↓



Response



\---



\# Scaling Strategy



Stage 1



Monolith



```text

Dashboard



API



Workers



Postgres



Redis

```



\---



Stage 2



Modular Monolith



Separate:



```text

Auth



Registry



Execution

```



\---



Stage 3



Distributed Services



Only when required.



\---



\# Architectural Rules



Rule 1



Connectors never access the database directly.



\---



Rule 2



Connectors never manage OAuth directly.



\---



Rule 3



All executions go through Execution Engine.



\---



Rule 4



Tool discovery only comes from Tool Registry.



\---



Rule 5



External applications are never called directly by AI.



\---



\# Core Competitive Advantage



The value of Nexus is not MCP.



The value of Nexus is:



```text

OAuth Infrastructure



Tool Registry



Execution Engine



Connector Framework

```



These components transform AI tool calls into secure real-world actions.



