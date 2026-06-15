\# Observability



\## Purpose



Observability allows operators and developers to understand the health and behavior of the platform.



Without observability:



```text

Something Broke



↓



Nobody Knows Why

```



\---



\# Pillars



\## Logging



\## Metrics



\## Tracing



\## Alerting



\---



\# Logging



Technology:



```text

Pino

```



Log:



```text

Requests



Tool Executions



OAuth Events



Connector Events



Errors

```



\---



\# Metrics



Technology:



```text

OpenTelemetry

```



Track:



```text

Request Count



Execution Count



Error Rate



Latency



Connector Health

```



\---



\# Distributed Tracing



Track:



```text

MCP Runtime



↓



Execution Engine



↓



Connector Runtime



↓



External API

```



Every request gets:



```text

Trace ID

```



\---



\# Connector Monitoring



Track:



```text

Success Rate



Failure Rate



Latency



Rate Limits

```



Per connector.



Example:



```text

gmail



github



slack

```



\---



\# Alerts



Trigger Alerts For:



```text

OAuth Failures



Database Errors



High Error Rates



API Downtime



Queue Backlogs

```



\---



\# Dashboards



Operational Dashboard:



```text

System Health



Connector Health



Execution Metrics



Error Metrics

```



\---



\# Key Metrics



MVP:



```text

Tool Executions



Success Rate



Average Duration



OAuth Failures



Active Connections

```



\---



\# Design Rule



Every execution must be traceable from:



```text

AI Tool Call



↓



Execution Engine



↓



Connector



↓



Provider Response

```



