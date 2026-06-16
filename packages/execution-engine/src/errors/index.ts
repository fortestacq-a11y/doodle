export class ExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

export class ToolNotFoundError extends ExecutionError {
  constructor(slug: string) {
    super("TOOL_NOT_FOUND", `Tool not found: ${slug}`);
  }
}

export class ConnectorNotConnectedError extends ExecutionError {
  constructor(connector: string) {
    super("CONNECTOR_NOT_CONNECTED", `Connector not connected: ${connector}`);
  }
}

export class TimeoutError extends ExecutionError {
  constructor(toolSlug: string, timeoutMs: number) {
    super("EXECUTION_TIMEOUT", `Tool ${toolSlug} timed out after ${timeoutMs}ms`, true);
  }
}
