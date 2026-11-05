/**
 * Login OAuth do tasks360 via Google Workspace.
 *
 * O Worker é o authorization server para os clientes MCP (claude.ai, Claude Code,
 * Cowork). A identidade vem do Google: só contas verificadas do domínio
 * ALLOWED_DOMAIN (ex: kliente360.com) recebem token.
 *
 * Fluxo:
 *   GET  /authorize  → valida o pedido do cliente MCP e mostra a tela de consentimento
 *   POST /authorize  → usuário aprovou: redireciona pro Google (com PKCE e hd=<domínio>)
 *   GET  /callback   → troca o code no Google, confere domínio e emite o token MCP
 */

import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

export interface AuthEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_DOMAIN: string;
}

/** O que fica gravado (criptografado) no grant e chega ao MCP em `this.props`. */
export type UserProps = {
  email: string;
  name: string;
  sub: string;
  via: "google" | "legacy-token";
};

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GRANTED_SCOPES = ["tasks360"];

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────

export const googleHandler = {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("tasks360-mcp ok", { status: 200 });
    }

    try {
      if (url.pathname === "/authorize" && request.method === "GET") return await showConsent(request, env);
      if (url.pathname === "/authorize" && request.method === "POST") return await handleConsent(request, env);
      if (url.pathname === "/callback" && request.method === "GET") return await handleCallback(request, env);
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) {
        return Response.redirect(error.redirectTo, 302);
      }
      if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
        const message =
          error instanceof AuthorizationError
            ? error.description ?? "Pedido de autorização inválido."
            : "Não foi possível verificar o aplicativo que pediu acesso.";
        return htmlPage("Não deu certo", `<p>${escapeHtml(message)}</p><p>Feche esta aba e tente conectar de novo.</p>`, 400);
      }
      throw error;
    }

    return new Response("not found", { status: 404 });
  },
};

// GET /authorize — tela de consentimento (obrigatória: o MCP aceita registro dinâmico de clientes)
async function showConsent(request: Request, env: AuthEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const authRequest = await oauth.parseAuthRequest(request);
  const details = await oauth.describeConsent(authRequest);
  const consent = await oauth.beginConsent(authRequest);
  consent.headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(consentPage(details, consent.handle, env.ALLOWED_DOMAIN), { headers: consent.headers });
}

// POST /authorize — aprovou → Google; negou → volta pro cliente com access_denied
async function handleConsent(request: Request, env: AuthEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const form = await request.formData();
  const handle = String(form.get("handle") ?? "");

  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }

  const approved = await oauth.approveConsent(request, handle, { scope: GRANTED_SCOPES });
  const verifier = randomString(48);
  const { state, headers } = await oauth.beginUpstream(approved.request, {
    data: { verifier },
    headers: approved.headers,
  });

  const google = new URL(GOOGLE_AUTHORIZE_URL);
  google.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  google.searchParams.set("redirect_uri", callbackUrl(request));
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", state);
  google.searchParams.set("code_challenge", await s256(verifier));
  google.searchParams.set("code_challenge_method", "S256");
  google.searchParams.set("hd", env.ALLOWED_DOMAIN); // só sugere a conta; a checagem de verdade é no callback
  google.searchParams.set("prompt", "select_account");

  headers.set("Location", google.toString());
  return new Response(null, { status: 302, headers });
}

// GET /callback — volta do Google
async function handleCallback(request: Request, env: AuthEnv): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const url = new URL(request.url);
  const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);

  const deny = () => {
    headers.set("Location", authorizationErrorRedirect(original, "access_denied"));
    return new Response(null, { status: 302, headers });
  };

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return deny();

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(request),
      grant_type: "authorization_code",
      code_verifier: data.verifier,
    }),
  });
  if (!tokenRes.ok) {
    console.error("google token exchange failed", tokenRes.status, await tokenRes.text());
    return htmlPage("Não deu certo", "<p>O Google recusou o login. Tente conectar de novo.</p>", 502);
  }

  // O id_token veio direto do endpoint do Google por TLS, então dá pra ler as claims
  // sem validar a assinatura (OpenID Connect Core, seção 3.1.3.7).
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  const claims = id_token ? decodeJwtPayload(id_token) : null;
  const domain = env.ALLOWED_DOMAIN.toLowerCase();
  const email = String(claims?.email ?? "").toLowerCase();

  const allowed =
    claims !== null &&
    claims.email_verified === true &&
    String(claims.hd ?? "").toLowerCase() === domain &&
    email.endsWith(`@${domain}`);

  if (!allowed) {
    // Conta fora do domínio: mostra o motivo em vez de só devolver erro pro cliente
    return htmlPage(
      "Conta não autorizada",
      `<p>O tasks360 só aceita contas <strong>@${escapeHtml(domain)}</strong>. Você entrou com <strong>${escapeHtml(
        email || "uma conta desconhecida",
      )}</strong>.</p><p>Feche esta aba e conecte de novo escolhendo a conta da Kliente 360.</p>`,
      403,
      headers,
    );
  }

  const props: UserProps = {
    email,
    name: String(claims!.name ?? email),
    sub: String(claims!.sub),
    via: "google",
  };

  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: email,
    metadata: { label: props.name },
    scope: GRANTED_SCOPES,
    props,
  });
  headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers });
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function callbackUrl(request: Request): string {
  return new URL("/callback", request.url).toString();
}

function randomString(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return base64url(buf);
}

async function s256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function htmlPage(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.delete("Location");
  return new Response(layout(title, body), { status, headers });
}

function consentPage(details: ConsentDescription, handle: string, domain: string): string {
  const name = escapeHtml(details.clientName);
  const origin = details.clientDomain
    ? `Publicado por <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "Este aplicativo se registrou sozinho; o nome dele não é verificado.";
  const loopback = details.redirectIsLoopback
    ? `<p class="warn">O acesso vai para um aplicativo <strong>no seu computador</strong>. Continue só se você acabou de pedir essa conexão.</p>`
    : "";
  return layout(
    `Conectar ${name} ao tasks360`,
    `<p><strong>${name}</strong> quer acessar o tasks360 em seu nome: ler e criar tasks, pessoas, clientes e standups.</p>
<p>${origin} O acesso será enviado para <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${loopback}
<p>No próximo passo você entra com sua conta Google <strong>@${escapeHtml(domain)}</strong>.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <button name="decision" value="approve" class="primary">Permitir</button>
  <button name="decision" value="deny">Negar</button>
</form>`,
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f5f6f8;color:#1b1f24;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}
  main{background:#fff;max-width:440px;width:100%;padding:28px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 16px} p{line-height:1.5} .warn{background:#fff4e5;padding:10px 12px;border-radius:8px}
  form{display:flex;gap:8px;margin-top:20px} button{flex:1;padding:10px;border-radius:8px;border:1px solid #c9ced6;background:#fff;font-size:15px;cursor:pointer}
  button.primary{background:#1b4dff;border-color:#1b4dff;color:#fff}
</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`;
}
