const WORKER_API_BASE_URL = "https://tarso-art.renanbuiatti14.workers.dev";

export async function onRequest(context) {
  const workerBase = (context.env.WORKER_API_BASE_URL || WORKER_API_BASE_URL).replace(/\/$/, "");
  const sourceUrl = new URL(context.request.url);
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, workerBase);
  const headers = new Headers(context.request.headers);

  headers.delete("host");
  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));

  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(context.request.method)) {
    init.body = context.request.body;
  }

  return fetch(new Request(targetUrl, init));
}
