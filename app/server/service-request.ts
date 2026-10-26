interface ServiceNamespace {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
}
export interface ServiceEnvironment {
  ENVIRONMENT?: string;
  INFERENCE?: ServiceNamespace;
  RENDERER?: ServiceNamespace;
  INFERENCE_URL?: string;
  RENDERER_URL?: string;
}

export async function serviceRequest(
  env: ServiceEnvironment,
  service: "inference" | "renderer",
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (env.ENVIRONMENT === "local") {
    const url = service === "inference" ? env.INFERENCE_URL : env.RENDERER_URL;
    if (!url) throw new Error(`${service} local service URL is missing`);
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
      throw new Error("Local services must use a loopback URL");
    return fetch(new Request(new URL(path, parsed), init));
  }
  const namespace = service === "inference" ? env.INFERENCE : env.RENDERER;
  if (!namespace) throw new Error(`${service} container binding is missing`);
  return namespace
    .getByName("shared")
    .fetch(new Request(`http://${service}.internal${path}`, init));
}
