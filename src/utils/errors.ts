/**
 * 统一错误处理：所有工具的错误都以可指导 LLM 的文本形式返回，
 * 而非裸异常或堆栈。
 */
export class McpToolError extends Error {
  constructor(
    message: string,
    public code: string = "TOOL_ERROR",
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

/** 将任意异常转换为可读错误文本 */
export function errText(e: unknown): string {
  if (e instanceof McpToolError) return `错误(${e.code})：${e.message}`;
  if (e instanceof Error) return `错误：${e.message}`;
  return `错误：${String(e)}`;
}

export type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * 工具回调包装器：统一 try/catch，异常转文本结果。
 * Args 泛型由调用处（server.tool 的 schema 推断）提供，保证回调参数类型准确。
 */
export function guard<Args>(fn: (args: Args) => Promise<string> | string) {
  return (args: Args): Promise<ToolResult> => {
    try {
      return Promise.resolve(fn(args)).then(
        (text) => ({ content: [{ type: "text" as const, text }] }),
        (e: unknown) => ({ content: [{ type: "text" as const, text: errText(e) }] }),
      );
    } catch (e) {
      return Promise.resolve({ content: [{ type: "text" as const, text: errText(e) }] });
    }
  };
}

/** 校验必填参数 */
export function requireStr(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new McpToolError(`参数 ${name} 不能为空`, "INVALID_PARAM");
  }
  return value;
}
