/**
 * Proxy-aware fetch wrapper.
 *
 * In environments with HTTP_PROXY / HTTPS_PROXY (like containerized CI/CD),
 * Node.js native fetch doesn't use the proxy automatically.
 * This module provides a fetch function that routes through the proxy.
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

let proxyAgent: ProxyAgent | undefined;

function getProxyAgent(): ProxyAgent | undefined {
  if (proxyAgent) return proxyAgent;

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (proxyUrl) {
    proxyAgent = new ProxyAgent(proxyUrl);
    console.log("[PROXY] Using proxy for outgoing requests");
  }

  return proxyAgent;
}

/**
 * Fetch that routes through the environment proxy if configured.
 * Falls back to native fetch if no proxy is set.
 */
export async function proxyFetch(
  url: string | URL,
  init?: RequestInit
): Promise<Response> {
  const agent = getProxyAgent();

  if (agent) {
    // Use undici fetch with proxy agent
    const response = await undiciFetch(url.toString(), {
      ...init,
      dispatcher: agent,
    } as Parameters<typeof undiciFetch>[1]);
    return response as unknown as Response;
  }

  // No proxy — use native fetch
  return fetch(url, init);
}
