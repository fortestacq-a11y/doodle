\# Database Design



\## Product



Nexus



Universal AI Integration Platform



Version: MVP v1



\---



\# Purpose



This document defines:



\* Core entities

\* Relationships

\* Table schemas

\* Indexing strategy

\* Multi-tenant architecture

\* OAuth storage

\* Execution logging



The database is the source of truth for the platform.



\---



\# Database Technology



Primary Database:



```text

PostgreSQL

```



ORM:



```text

Prisma

```



\---



\# Multi-Tenant Model



Every record belongs to a workspace.



Example:



```text

Workspace A



&#x20; Gmail Connection

&#x20; GitHub Connection

&#x20; Tool Calls



Workspace B



&#x20; Gmail Connection

&#x20; Slack Connection

&#x20; Tool Calls

```



Data must never leak across workspaces.



\---



\# Entity Relationship Diagram



```text

User

&#x20;│

&#x20;▼



Workspace

&#x20;│

&#x20;├───────────── Connections

&#x20;│

&#x20;├───────────── API Keys

&#x20;│

&#x20;├───────────── Tool Calls

&#x20;│

&#x20;├───────────── Workflows

&#x20;│

&#x20;└───────────── Agent Runs



Tools

&#x20;│

&#x20;▼



Tool Versions



Connections

&#x20;│

&#x20;▼



OAuth Tokens

```



\---



\# Table: users



Purpose:



Authentication identities.



```sql

users



id UUID PK



email VARCHAR UNIQUE



name VARCHAR



image\_url TEXT



created\_at TIMESTAMP



updated\_at TIMESTAMP

```



Indexes:



```sql

email

```



\---



\# Table: workspaces



Purpose:



Tenant boundary.



```sql

workspaces



id UUID PK



name VARCHAR



owner\_id UUID



created\_at TIMESTAMP

```



Relationships:



```text

owner\_id

→ users.id

```



\---



\# Table: workspace\_members



Purpose:



Team collaboration.



```sql

workspace\_members



id UUID PK



workspace\_id UUID



user\_id UUID



role VARCHAR



created\_at TIMESTAMP

```



Roles:



```text

owner



admin



member



viewer

```



\---



\# Table: api\_keys



Purpose:



Programmatic access.



```sql

api\_keys



id UUID PK



workspace\_id UUID



name VARCHAR



key\_hash TEXT



last\_used\_at TIMESTAMP



created\_at TIMESTAMP

```



Never store raw API keys.



Only hashes.



\---



\# Table: connectors



Purpose:



Installed connector definitions.



```sql

connectors



id UUID PK



name VARCHAR



slug VARCHAR



version VARCHAR



created\_at TIMESTAMP

```



Examples:



```text

gmail



github



slack



notion

```



\---



\# Table: connections



Purpose:



User application connections.



```sql

connections



id UUID PK



workspace\_id UUID



connector\_id UUID



status VARCHAR



connected\_at TIMESTAMP



updated\_at TIMESTAMP

```



Status:



```text

connected



expired



revoked



error

```



\---



\# Table: oauth\_tokens



Purpose:



OAuth credentials.



```sql

oauth\_tokens



id UUID PK



connection\_id UUID



access\_token TEXT



refresh\_token TEXT



expires\_at TIMESTAMP



token\_type VARCHAR



updated\_at TIMESTAMP

```



Important:



```text

Encrypted At Rest

```



Access tokens never exposed publicly.



\---



\# Table: tools



Purpose:



Tool definitions.



```sql

tools



id UUID PK



connector\_id UUID



name VARCHAR



slug VARCHAR



description TEXT



category VARCHAR



created\_at TIMESTAMP

```



Example:



```text

gmail\_send\_email



github\_create\_issue



slack\_send\_message

```



\---



\# Table: tool\_versions



Purpose:



Version history.



```sql

tool\_versions



id UUID PK



tool\_id UUID



version VARCHAR



schema JSONB



created\_at TIMESTAMP

```



Example:



```json

{

&#x20; "to":"string",

&#x20; "subject":"string",

&#x20; "body":"string"

}

```



\---



\# Table: tool\_calls



Purpose:



Execution history.



```sql

tool\_calls



id UUID PK



workspace\_id UUID



tool\_id UUID



status VARCHAR



duration\_ms INTEGER



started\_at TIMESTAMP



completed\_at TIMESTAMP

```



Status:



```text

queued



running



success



failed

```



\---



\# Table: tool\_call\_inputs



Purpose:



Store execution input.



```sql

tool\_call\_inputs



id UUID PK



tool\_call\_id UUID



payload JSONB

```



Example:



```json

{

&#x20; "to":"john@gmail.com"

}

```



\---



\# Table: tool\_call\_outputs



Purpose:



Store execution output.



```sql

tool\_call\_outputs



id UUID PK



tool\_call\_id UUID



payload JSONB

```



Example:



```json

{

&#x20; "success": true

}

```



\---



\# Table: execution\_errors



Purpose:



Store failures.



```sql

execution\_errors



id UUID PK



tool\_call\_id UUID



error\_code VARCHAR



error\_message TEXT



created\_at TIMESTAMP

```



\---



\# Table: workflows



Purpose:



Workflow definitions.



```sql

workflows



id UUID PK



workspace\_id UUID



name VARCHAR



definition JSONB



created\_at TIMESTAMP

```



Example:



```text

GitHub Issue



↓



Slack Message



↓



Email Summary

```



\---



\# Table: workflow\_runs



Purpose:



Workflow execution history.



```sql

workflow\_runs



id UUID PK



workflow\_id UUID



status VARCHAR



started\_at TIMESTAMP



completed\_at TIMESTAMP

```



\---



\# Table: agents



Purpose:



Future agent runtime.



```sql

agents



id UUID PK



workspace\_id UUID



name VARCHAR



type VARCHAR



created\_at TIMESTAMP

```



\---



\# Table: agent\_runs



Purpose:



Agent execution history.



```sql

agent\_runs



id UUID PK



agent\_id UUID



status VARCHAR



started\_at TIMESTAMP



completed\_at TIMESTAMP

```



\---



\# Table: audit\_logs



Purpose:



Security auditing.



```sql

audit\_logs



id UUID PK



workspace\_id UUID



actor\_id UUID



action VARCHAR



resource\_type VARCHAR



resource\_id UUID



created\_at TIMESTAMP

```



Example:



```text

Connected Gmail



Deleted API Key



Executed Tool

```



\---



\# Important Relationships



```text

users

&#x20; │

&#x20; ▼



workspaces

&#x20; │

&#x20; ▼



connections

&#x20; │

&#x20; ▼



oauth\_tokens

```



\---



```text

connectors

&#x20; │

&#x20; ▼



tools

&#x20; │

&#x20; ▼



tool\_versions

```



\---



```text

workspaces

&#x20; │

&#x20; ▼



tool\_calls

&#x20; │

&#x20; ├──── inputs

&#x20; ├──── outputs

&#x20; └──── errors

```



\---



\# Index Strategy



Create indexes on:



```sql

workspace\_id



tool\_id



connector\_id



status



created\_at

```



High-frequency queries depend on these.



\---



\# Security Rules



Rule 1



OAuth tokens encrypted.



\---



Rule 2



API keys hashed.



\---



Rule 3



Workspace isolation enforced.



\---



Rule 4



Every execution logged.



\---



Rule 5



Every sensitive action audited.



\---



\# MVP Tables



Required:



```text

users



workspaces



workspace\_members



api\_keys



connectors



connections



oauth\_tokens



tools



tool\_versions



tool\_calls



tool\_call\_inputs



tool\_call\_outputs



execution\_errors



audit\_logs

```



\---



\# Future Tables



Not MVP:



```text

marketplace\_connectors



billing\_accounts



subscriptions



agent\_memory



vector\_embeddings



knowledge\_graph\_nodes



knowledge\_graph\_edges

```



\---



\# Database Principle



The database must be designed so that:



1\. Any connector can be added without schema changes.



2\. Any tool can be versioned.



3\. Every execution is traceable.



4\. Every workspace remains isolated.



5\. Future agent and marketplace systems can be added without redesigning core tables.



