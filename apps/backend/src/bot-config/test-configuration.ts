import { BotConfigService } from './bot-config.service';
import { defaultConfiguration } from './config-schema';
// Sólo para unidades: transporte web controlado por la prueba, publicación estable.
export function testConfiguration(): BotConfigService {
  return {
    active: () =>
      Promise.resolve({ version: 1, configuration: defaultConfiguration() }),
    isCurrent: () => Promise.resolve(true),
    withActiveGuard: async (
      _version: unknown,
      action: () => Promise<unknown>,
    ) => action(),
    documentContext: async (
      _snapshot: unknown,
      _query: unknown,
      web: () => Promise<string>,
    ) => ({ context: await web(), sources: [] }),
  } as unknown as BotConfigService;
}
