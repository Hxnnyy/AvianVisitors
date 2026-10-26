import { Container } from "@cloudflare/containers";
export { default } from "./index";

interface ContainerSecrets {
  INFERENCE_TOKEN: string;
  RENDERER_TOKEN: string;
}

export class InferenceContainer extends Container<ContainerSecrets> {
  defaultPort = 8081;
  sleepAfter = "2m";
  enableInternet = false;
  envVars = { INFERENCE_TOKEN: this.env.INFERENCE_TOKEN };
}

export class RendererContainer extends Container<ContainerSecrets> {
  defaultPort = 8082;
  sleepAfter = "30s";
  enableInternet = false;
  envVars = { RENDERER_TOKEN: this.env.RENDERER_TOKEN };
}
