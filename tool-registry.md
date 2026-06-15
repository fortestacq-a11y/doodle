\# Tool Registry



\## Purpose



The Tool Registry is the source of truth for all tools available in Nexus.



Every MCP tool originates from the Tool Registry.



\---



\# Responsibilities



The Tool Registry manages:



\* Tool Metadata

\* Tool Schemas

\* Tool Discovery

\* Tool Versioning

\* Tool Permissions



\---



\# Example Tool



```json id="jk2y1e"

{

&#x20; "name":"gmail\_send\_email",

&#x20; "connector":"gmail",

&#x20; "version":"1.0.0"

}

```



\---



\# Architecture



```text id="0r2kgw"

Connector



↓



SDK



↓



Registry



↓



MCP Runtime



↓



AI Client

```



\---



\# Tool Registration



During startup:



```text id="hn09lc"

Load Connector



↓



Load Actions



↓



Register Tools

```



\---



\# Tool Metadata



Every tool stores:



```text id="5ez2sm"

name



slug



description



version



connector



category

```



\---



\# Tool Discovery



MCP requests:



```json id="ln6kcg"

{

&#x20; "method":"tools/list"

}

```



Registry returns:



```json id="z7w7ti"

\[

&#x20; {

&#x20;   "name":"gmail\_send\_email"

&#x20; }

]

```



\---



\# Tool Versioning



Example:



```text id="2ye3z6"

gmail\_send\_email



1.0.0



1.1.0



2.0.0

```



Multiple versions may coexist.



\---



\# Permissions



Before exposing a tool:



Check:



```text id="zkckv6"

Workspace



Connector



User Role



Tool Status

```



\---



\# Tool Categories



Examples:



```text id="xfg4tp"

Communication



Productivity



CRM



Development



Marketing

```



\---



\# Registry Flow



```text id="e9vj2x"

Connector



↓



SDK Validation



↓



Registry Storage



↓



MCP Exposure



↓



Execution Engine

```



\---



\# Design Rule



The Tool Registry is the only source of truth for tool discovery.



No service may hardcode tool definitions.



