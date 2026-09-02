import { decryptApiKey, encryptApiKey } from './apiKeyCrypto'

/** Supported LLM API backends for the CAD agent. */
export type LlmProviderId =
  | 'openai'
  | 'anthropic'
  | 'openai-compatible'
  | 'deepseek'
  | 'kimi'

/**
 * Persisted LLM configuration for the CAD agent chat panel.
 */
export interface LlmSettings {
  /** Selected API provider implementation. */
  provider: LlmProviderId
  /** Secret API key for the provider. */
  apiKey: string
  /** REST API base URL (provider-specific default when empty). */
  baseUrl: string
  /** Model identifier passed to the provider SDK. */
  model: string
}

/** On-disk shape stored in `localStorage`. */
interface PersistedLlmSettings {
  provider?: LlmProviderId
  baseUrl?: string
  model?: string
  /** Encrypted API key (preferred). */
  apiKeyEnc?: string
  /** Legacy plaintext API key, migrated on load/save. */
  apiKey?: string
}

/** `localStorage` key for serialized {@link LlmSettings}. */
const STORAGE_KEY = 'cad-agent-plugin.llm-settings'

/**
 * Default base URL and model id per provider, used when settings are first opened.
 */
export const PROVIDER_DEFAULTS: Record<
  LlmProviderId,
  Pick<LlmSettings, 'baseUrl' | 'model'>
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-haiku-latest'
  },
  'openai-compatible': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  },
  kimi: {
    baseUrl: 'https://api.kimi.com/coding/v1',
    model: 'k3'
  }
}

/** Fallback settings when nothing is stored or parsing fails. */
const DEFAULTS: LlmSettings = {
  provider: 'openai-compatible',
  apiKey: '',
  ...PROVIDER_DEFAULTS['openai-compatible']
}

/**
 * Returns the default base URL and model for a provider.
 *
 * @param provider - LLM provider id.
 * @returns A shallow copy of the provider entry in {@link PROVIDER_DEFAULTS}.
 */
export function getProviderDefaults(
  provider: LlmProviderId
): Pick<LlmSettings, 'baseUrl' | 'model'> {
  return { ...PROVIDER_DEFAULTS[provider] }
}

/**
 * Restores the API key from persisted storage, including legacy plaintext values.
 *
 * @param persisted - Parsed JSON from `localStorage`.
 * @returns Decrypted or legacy plaintext API key.
 */
async function restoreApiKey(persisted: PersistedLlmSettings): Promise<string> {
  if (persisted.apiKeyEnc) {
    return decryptApiKey(persisted.apiKeyEnc)
  }
  if (typeof persisted.apiKey === 'string') {
    return persisted.apiKey
  }
  return ''
}

/** Providers that have been removed; persisted values are migrated to the DeepSeek provider. */
const RETIRED_PROVIDERS: Record<string, LlmProviderId> = {
  'deepseek-vl': 'deepseek'
}

/**
 * Loads LLM settings from `localStorage`, merged over {@link DEFAULTS}.
 *
 * Retired providers (e.g. `deepseek-vl`) are migrated to their replacement so
 * existing users never boot into an invalid selection.
 *
 * @returns Parsed settings with decrypted API key, or defaults when missing or invalid.
 */
export async function loadLlmSettings(): Promise<LlmSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }

    const persisted = JSON.parse(raw) as PersistedLlmSettings
    const apiKey = await restoreApiKey(persisted)

    const merged: LlmSettings = {
      ...DEFAULTS,
      ...persisted,
      apiKey
    }

    const replacement = RETIRED_PROVIDERS[merged.provider]
    if (replacement) {
      const defaults = getProviderDefaults(replacement)
      merged.provider = replacement
      merged.baseUrl = defaults.baseUrl
      merged.model = defaults.model
    }

    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Persists LLM settings to `localStorage` with an encrypted API key.
 *
 * @param settings - Full settings object to serialize.
 */
export async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  const apiKeyEnc = settings.apiKey ? await encryptApiKey(settings.apiKey) : ''

  const persisted: PersistedLlmSettings = {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKeyEnc
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
}
