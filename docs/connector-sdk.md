\# Connector SDK



\## Purpose



The Connector SDK defines the standard interface for all Nexus connectors.



Every connector must use the SDK.



The SDK ensures:



\* Consistency

\* Validation

\* Tool Discovery

\* Versioning

\* Testing

\* MCP Compatibility



\---



\# Core Principle



Every connector should look identical to the platform.



Example:



```typescript id="8j22gk"

defineConnector({

\&#x20; name: "gmail",

\&#x20; auth: OAuth2,

\&#x20; actions: \\\[...]

})

```



The platform should not care whether the connector is:



\* Gmail

\* GitHub

\* Slack

\* Salesforce



All connectors expose the same interface.



\---



\# Connector Structure



```text id="m95e3e"

connector/



manifest.ts



auth.ts



actions/



schemas/



tests/

```



\---



\# Connector Manifest



Example:



```typescript id="8w9nmi"

export default defineConnector({

\&#x20; name: "gmail",



\&#x20; version: "1.0.0",



\&#x20; auth: OAuth2,



\&#x20; actions: \\\[

\&#x20;   sendEmail,

\&#x20;   listEmails

\&#x20; ]

})

```



\---



\# Actions



Example:



```typescript id="i6zth7"

export const sendEmail = defineAction({

\&#x20; name: "gmail\\\_send\\\_email",



\&#x20; description: "Send email",



\&#x20; inputSchema: {},



\&#x20; execute: async () => {}

})

```



\---



\# Requirements



Every connector must provide:



\* Manifest

\* Auth Definition

\* Action Definitions

\* Schemas

\* Tests



\---



\# Connector Lifecycle



```text id="qj8r4k"

Connector



↓



SDK Validation



↓



Registry Registration



↓



MCP Exposure



↓



Execution Ready

```



\---



\# Design Rule



No connector may bypass the SDK.

