// Minimal MCP HTTP server — implements just enough of the MCP "streamable-http"
// transport for claude-code's --mcp-config to work as an HTTP MCP client.
//
// Wire format: JSON-RPC 2.0 over HTTP. Client POSTs requests; daemon replies
// with synchronous JSON. No SSE / streaming needed for our synchronous tools.
//
// Methods supported:
//   - initialize                       → handshake; returns protocol version + tool capability
//   - notifications/initialized        → client tells us it's ready (no response)
//   - tools/list                       → return our tool catalog
//   - tools/call                       → execute a tool, return content
//
// URL shape: /mcp/agent/<agentId>     (agentId identifies the calling agent)

import { sendTo, readNeighborVault, moveToward, TOOL_DEFINITIONS, type AgentMover } from "./world-tools.ts";
import type { World } from "./world.ts";

const PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Returns Response if the URL is an MCP endpoint, else null. */
export async function handleMcpRequest(
  req: Request,
  world: World,
  mover: AgentMover,
): Promise<Response | null> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/mcp\/agent\/([^/]+)\/?$/);
  if (!match) return null;
  const agentId = match[1]!;

  // CORS preflight (for safety; claude-code spawns its own client so this rarely fires).
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version",
      },
    });
  }

  // GET — could be a stream open in streamable-http. We don't push server-initiated
  // messages, so just return 405. Most clients won't try this when we return
  // synchronous JSON for POST.
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(makeError(null, -32700, "Parse error"));
  }

  // The MCP spec allows either a single request or a batch. Support both.
  const requests: JsonRpcRequest[] = Array.isArray(body) ? body as JsonRpcRequest[] : [body as JsonRpcRequest];
  const responses: JsonRpcResponse[] = [];

  for (const r of requests) {
    if (!r || r.jsonrpc !== "2.0" || typeof r.method !== "string") {
      responses.push(makeError(r?.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    const resp = handleMethod(agentId, r, world, mover);
    // Notifications (no id) get no response.
    if (r.id === undefined || r.id === null) continue;
    responses.push(resp);
  }

  if (responses.length === 0) return new Response(null, { status: 204 });
  if (!Array.isArray(body)) return jsonResponse(responses[0]!);
  return jsonResponse(responses);
}

function handleMethod(
  agentId: string,
  req: JsonRpcRequest,
  world: World,
  mover: AgentMover,
): JsonRpcResponse {
  const id = req.id ?? null;

  switch (req.method) {
    case "initialize": {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: "squadron", version: "0.1.0" },
          capabilities: {
            tools: { listChanged: false },
          },
        },
      };
    }

    case "notifications/initialized": {
      // No response needed for notifications.
      return { jsonrpc: "2.0", id, result: null };
    }

    case "tools/list": {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOL_DEFINITIONS },
      };
    }

    case "tools/call": {
      const params = req.params ?? {};
      const name = (params as { name?: unknown }).name;
      const argsIn = (params as { arguments?: unknown }).arguments ?? {};
      if (typeof name !== "string") {
        return makeError(id, -32602, "Invalid params: missing tool name");
      }

      let toolResult;
      try {
        if (name === "send_to") {
          toolResult = sendTo(world, agentId, argsIn as Record<string, unknown>);
        } else if (name === "read_neighbor_vault") {
          toolResult = readNeighborVault(world, agentId, argsIn as Record<string, unknown>);
        } else if (name === "move_toward") {
          toolResult = moveToward(world, mover, agentId, argsIn as Record<string, unknown>);
        } else {
          return makeError(id, -32601, `Unknown tool: ${name}`);
        }
      } catch (err) {
        return makeError(
          id,
          -32603,
          `tool '${name}' threw: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // MCP tool result format: content array with type/text fields. Embed our
      // structured ToolResult as JSON inside a text block, which is what the
      // SDK does by default for non-content-typed returns.
      const text = JSON.stringify(toolResult);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
          isError: !toolResult.ok,
        },
      };
    }

    default:
      return makeError(id, -32601, `Method not found: ${req.method}`);
  }
}

function makeError(
  id: number | string | null,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
