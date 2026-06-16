\# OAuth System



\## Purpose



The OAuth System manages authentication between user accounts and external providers.



Examples:



\* Google

\* GitHub

\* Slack

\* Notion

\* Discord



\---



\# Responsibilities



The OAuth System handles:



\* Authorization

\* Token Storage

\* Token Refresh

\* Revocation

\* Connection Validation



\---



\# Architecture



```text id="ef6fdo"

User



↓



Dashboard



↓



OAuth Service



↓



Provider



↓



OAuth Tokens



↓



Database

```



\---



\# Connection Flow



Example:



Connect Gmail.



\---



Step 1



User clicks:



```text id="7lw0qx"

Connect Gmail

```



\---



Step 2



Redirect:



```text id="bnj5yo"

accounts.google.com

```



\---



Step 3



User grants permission.



\---



Step 4



Google returns:



```text id="0w7wui"

authorization code

```



\---



Step 5



OAuth Service exchanges code for:



```text id="yb64sq"

access token



refresh token

```



\---



Step 6



Store encrypted credentials.



\---



\# Database



Tables:



```text id="jlwm1q"

connections



oauth\_tokens

```



\---



\# Token Refresh



Before execution:



```text id="upw4h2"

Check expires\_at

```



If expired:



```text id="7mcm25"

Use refresh token



Request new access token



Update database

```



\---



\# Security Rules



1\. Encrypt tokens at rest.



2\. Never expose refresh tokens.



3\. Never log access tokens.



4\. Always use HTTPS.



\---



\# Design Rule



Connectors never manage OAuth.



Only OAuth Service manages credentials.



