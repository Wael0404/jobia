import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createContainer } from "./container";

async function main(): Promise<void> {
  const config = loadConfig();
  const container = createContainer(config);
  const app = await buildApp(container);

  // Graceful shutdown: Kubernetes sends SIGTERM, we stop accepting traffic,
  // drain in-flight requests, then close pools.
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await container.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: "0.0.0.0", port: config.PORT });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
