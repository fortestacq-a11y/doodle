\# System Design



\## Product



Nexus



Universal AI Integration Platform



\---



\# Purpose



This document defines how all platform components interact to execute AI tool calls against external applications.



It focuses on:



\* Service boundaries

\* Request flows

\* Data flows

\* Execution lifecycle

\* Internal communication



\---



\# System Overview



```text id="4awtzn"

User

&#x20;│

&#x20;▼



AI Agent



&#x20;│

&#x20;▼



MCP Runtime



&#x20;│

&#x20;▼



API Gateway



&#x20;│

&#x20;▼



Tool Registry



&#x20;│

&#x20;▼



Connection Service



&#x20;│

&#x20;▼



Execution Engine



&#x20;│

&#x20;▼



Connector Runtime



&#x20;│

&#x20;▼



External Applications

```



\---



\# Core Execution Flow



Example:



User:



```text id="z1wv5r"

Send email to john@gmail.com

```



\---



LLM generates:



```json id="jbd0l6"

{

&#x20; "tool":"gmail\_send\_email",

&#x20; "arguments":{}

}

```



\---



Flow:



```text id="gjnh0s"

Tool Call



↓



API Gateway



↓



Registry Lookup



↓



OAuth Lookup



↓



Execution Engine



↓



Connector Runtime



↓



Gmail API



↓



Response

```



\---



\# Service Responsibilities



\## MCP Runtime



Responsibilities:



\* Tool discovery

\* Tool exposure

\* Session management



Never:



\* Execute tools

\* Access OAuth tokens



\---



\## API Gateway



Responsibilities:



\* Authentication

\* Authorization

\* Validation

\* Routing



Never:



\* Execute business logic



\---



\## Tool Registry



Responsibilities:



\* Tool metadata

\* Tool schemas

\* Tool versions



Example:



```json id="k38zrt"

{

&#x20; "tool":"github\_create\_issue",

&#x20; "connector":"github"

}

```



\---



\## Connection Service



Responsibilities:



\* OAuth token storage

\* Token refresh

\* Connection validation



Never:



\* Execute actions



\---



\## Execution Engine



Responsibilities:



\* Build execution context

\* Validate permissions

\* Execute actions

\* Retry failures

\* Log results



\---



\## Connector Runtime



Responsibilities:



\* Provider specific APIs

\* Request translation

\* Response formatting



Example:



```text id="d9fgow"

gmail\_send\_email

```



becomes



```http id="c4s7nm"

POST gmail.googleapis.com

```



\---



\# Internal Communication



All services communicate through:



```text id="iwnt0w"

TypeScript Interfaces



Internal APIs



Event Messages

```



\---



\# Job Execution Flow



Fast operations:



```text id="tk1ttg"

API Gateway



↓



Execution Engine



↓



Connector



↓



Response

```



\---



Long operations:



```text id="g4rj1u"

API Gateway



↓



BullMQ Queue



↓



Worker



↓



Execution Engine



↓



Connector



↓



Result

```



\---



\# Connector Lifecycle



Registration:



```text id="jlwmys"

Connector



↓



Manifest



↓



Registry



↓



Available Tool

```



Execution:



```text id="l6l7v8"

Tool



↓



Registry



↓



Connector



↓



API Call

```



\---



\# Failure Handling



Failure Types:



```text id="z3c4nm"

OAuth Failure



Rate Limit



Timeout



Provider Error



Validation Error

```



\---



Retry Strategy:



```text id="84axc5"

1st Retry

30 seconds



2nd Retry

2 minutes



3rd Retry

10 minutes

```



\---



\# Logging Flow



Every execution creates:



```text id="49pq6m"

Execution Record



Request



Response



Duration



Status



Error

```



Stored in PostgreSQL.



\---



\# Scaling Model



Stage 1



Single Deployment



```text id="cnq95q"

API



Workers



Postgres



Redis

```



\---



Stage 2



Split Workers



```text id="tkv6x4"

API



Workers



Connectors

```



\---



Stage 3



Distributed Services



```text id="x4d9um"

Gateway



Execution



Registry



Auth

```



Only when necessary.



\---



\# System Design Principles



1\. AI never calls external APIs directly.



2\. Connectors never own OAuth.



3\. Execution always passes through Execution Engine.



4\. Tool discovery always comes from Registry.



5\. Every execution is logged.



6\. Every action is auditable.



