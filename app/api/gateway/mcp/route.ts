import { NextResponse } from "next/server";
import crypto from "crypto";
import { actorFromAccessToken } from "@/lib/oauth/server";
import { actorFromToken } from "@/lib/services/tokens";
import { TOOLS, getTool } from "@/lib/gateway/tools";
import { ServiceError, type ActorContext } from "@/lib/services/context";
import { rateAllow } from "@/lib/publicStats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ── MCP over Streamable HTTP (JSON-RPC 2.0), POST /api/gateway/mcp ──
// Auth: Bearer access token. Try the OAuth path first (pzat_...), then fall back
// to an integration token (pz_...) so both front doors work here. On failure,
// 401 with a WWW-Authenticate header pointing at the protected-resource metadata
// so an MCP client knows where to start the OAuth dance.
//
// tools/list is SCOPE-FILTERED: a grant only ever SEES tools within its scopes,
// so a read+safe-write connection never lists (or can call) approve/publish.

// Minimal, permissive JSON Schemas per tool. Extra keys are ignored by handlers.
const TOOL_META: Record<string, { description: string; inputSchema: Record<string, unknown> }> = {
  get_company_status: { description: "Get company name, ticker, quiet-mode and quiet-period status.", inputSchema: { type: "object", properties: {} } },
  get_quiet_period_status: { description: "Is a quiet period / quiet mode currently active?", inputSchema: { type: "object", properties: {} } },
  list_posts: { description: "List posts, optionally filtered by status.", inputSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } } },
  get_post: { description: "Get a single post by id.", inputSchema: { type: "object", properties: { postId: { type: "string" } }, required: ["postId"] } },
  get_pending_approvals: { description: "List posts awaiting approval.", inputSchema: { type: "object", properties: {} } },
  list_crm_contacts: { description: "List CRM contacts, optional search.", inputSchema: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" } } } },
  list_crm_tasks: { description: "List CRM tasks (open by default).", inputSchema: { type: "object", properties: { openOnly: { type: "boolean" }, limit: { type: "number" } } } },
  create_post_draft: { description: "Create a new post draft.", inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, channels: { type: "array", items: { type: "string" } }, theme: { type: "string" } }, required: ["title", "body"] } },
  update_post_draft: { description: "Update a post draft's title or body.", inputSchema: { type: "object", properties: { postId: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, required: ["postId"] } },
  create_crm_note: { description: "Append a note to a CRM contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, body: { type: "string" } }, required: ["contactId", "body"] } },
  create_crm_task: { description: "Create a CRM task.", inputSchema: { type: "object", properties: { title: { type: "string" }, dueDate: { type: "string" }, contactId: { type: "string" } }, required: ["title"] } },
  prepare_approve_content: { description: "Phase 1 of approving a post — returns a confirmation to execute.", inputSchema: { type: "object", properties: { postId: { type: "string" } }, required: ["postId"] } },
  execute_approve_content: { description: "Phase 2 — approve using a confirmation from prepare_approve_content.", inputSchema: { type: "object", properties: { confirmationId: { type: "string" }, postId: { type: "string" } }, required: ["confirmationId", "postId"] } },
  prepare_publish_content: { description: "Phase 1 of publishing approved posts — returns a confirmation.", inputSchema: { type: "object", properties: {} } },
  execute_publish_content: { description: "Phase 2 — publish approved posts using a confirmation.", inputSchema: { type: "object", properties: { confirmationId: { type: "string" }, idempotencyKey: { type: "string" } }, required: ["confirmationId"] } },
};

const PROTOCOL_VERSION = "2025-06-18";

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: { "cache-control": "no-store" } });
}
function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: { "cache-control": "no-store" } });
}

async function resolveActor(req: Request, requestId: string): Promise<ActorContext | null> {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return null;
  // OAuth access token first, then integration token.
  return (await actorFromAccessToken(bearer, requestId)) ?? (await actorFromToken(bearer, requestId));
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const origin = new URL(req.url).origin;

  const ctx = await resolveActor(req, requestId);
  if (!ctx) {
    return new NextResponse(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    });
  }

  // Per-token rate limit (keyed off the server-derived actor id).
  if (!(await rateAllow(`mcp:${ctx.actorId}`, 60))) {
    return rpcError(null, -32000, "Rate limited — try again in a minute.");
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return rpcError(null, -32700, "Parse error");
  const { id, method, params } = body as { id?: unknown; method?: string; params?: Record<string, unknown> };

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: "PubcoZone Gateway", version: "1.0.0" },
        capabilities: { tools: {} },
      });

    case "notifications/initialized":
      // Notifications have no id and expect no response body.
      return new NextResponse(null, { status: 202 });

    case "ping":
      return rpcResult(id, {});

    case "tools/list": {
      // SCOPE FILTER: only tools whose required scope is granted to this actor.
      const tools = Object.entries(TOOLS)
        .filter(([, def]) => ctx.scopes.includes(def.scope))
        .map(([name]) => ({
          name,
          description: TOOL_META[name]?.description ?? name,
          inputSchema: TOOL_META[name]?.inputSchema ?? { type: "object" },
        }));
      return rpcResult(id, { tools });
    }

    case "tools/call": {
      const name = String((params as { name?: unknown })?.name ?? "");
      const args = ((params as { arguments?: unknown })?.arguments ?? {}) as Record<string, unknown>;
      const tool = getTool(name);
      if (!tool) return rpcError(id, -32601, `Unknown tool "${name}".`);
      if (!ctx.scopes.includes(tool.scope)) {
        // Forbidden — surface as an MCP error result (isError), not a transport error.
        return rpcResult(id, { content: [{ type: "text", text: `Forbidden: this connection lacks the ${tool.scope} scope.` }], isError: true });
      }
      try {
        const result = await tool.handler(ctx, args);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (e) {
        if (e instanceof ServiceError) {
          return rpcResult(id, { content: [{ type: "text", text: e.message }], isError: true });
        }
        const code = (e as { code?: string })?.code;
        if (code === "conflict") {
          return rpcResult(id, { content: [{ type: "text", text: (e as Error).message }], isError: true });
        }
        console.error(`[mcp] tool ${name} failed (req ${requestId}):`, e);
        return rpcResult(id, { content: [{ type: "text", text: "The operation failed." }], isError: true });
      }
    }

    default:
      return rpcError(id, -32601, `Method "${method ?? ""}" not found.`);
  }
}
