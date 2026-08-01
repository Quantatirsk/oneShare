import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { ModelCatalog } from './model-catalog.js';
import { PiConversationModule } from './pi-conversation-module.js';
import { registerRoutes } from './routes.js';

class ConcurrencyGate {
  private active = 0;

  public constructor(private readonly limit: number) {}

  public acquire(): (() => void) | undefined {
    if (this.active >= this.limit) {
      return undefined;
    }
    this.active += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active -= 1;
      }
    };
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const catalog = new ModelCatalog(config);
  await catalog.start();
  const app = Fastify({ logger: true, requestIdHeader: 'x-request-id' });
  const concurrencyGate = new ConcurrencyGate(config.maxConcurrency);
  const conversations = new PiConversationModule(config, catalog);
  await registerRoutes(app, {
    catalog,
    conversations,
    acquire: concurrencyGate.acquire.bind(concurrencyGate),
  });
  const close = async () => {
    await conversations.close();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => { void close(); });
  process.once('SIGINT', () => { void close(); });
  await app.listen({ host: config.host, port: config.port });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
