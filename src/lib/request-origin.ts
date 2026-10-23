// The site's public address. Behind nginx, request.url is the local server (http://localhost:3010),
// so use the Host and X-Forwarded-Proto the proxy passes on (Vercel sends the same headers).
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return url.origin;
  return `${request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1)}://${host}`;
}
