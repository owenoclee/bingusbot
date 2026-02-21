import { DAEMON_URL } from "./config.ts";

interface OpenAIToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export async function fetchTools(): Promise<OpenAIToolSchema[]> {
  try {
    const res = await fetch(`${DAEMON_URL}/tools`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    console.log("daemon unreachable, running without tools");
    return [];
  }
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${DAEMON_URL}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
