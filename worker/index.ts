/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS?: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const atlasPaths = new Set(["/", "/index.html", "/atlas.html"]);

async function serveAtlas(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!atlasPaths.has(url.pathname) || !["GET", "HEAD"].includes(request.method)) {
    return null;
  }
  if (!env.ASSETS) return null;

  const assetUrl = new URL("/atlas.html", request.url);
  const assetRequest = new Request(assetUrl, {
    method: request.method,
    headers: request.headers,
  });
  const asset = await env.ASSETS.fetch(assetRequest);
  if (!asset.ok) return null;

  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "content-security-policy",
    "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; " +
      "frame-ancestors 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
      "img-src 'self' data: https:; font-src 'self' data:; connect-src 'none'",
  );

  if (request.method === "HEAD") return new Response(null, { status: asset.status, headers });

  const origin = url.origin;
  const html = (await asset.text()).replaceAll("__ATLAS_ORIGIN__", origin);
  headers.delete("content-length");
  return new Response(html, { status: asset.status, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const atlas = await serveAtlas(request, env, url);
    if (atlas) return atlas;

    if (url.pathname === "/_vinext/image") {
      const assets = env.ASSETS;
      if (!assets) return new Response("Asset binding unavailable", { status: 503 });
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
