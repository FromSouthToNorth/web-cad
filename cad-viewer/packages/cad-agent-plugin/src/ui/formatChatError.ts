import { APICallError } from 'ai'

/**
 * Extracts a human-readable message from a provider error payload.
 *
 * @param value - Parsed JSON body or nested `error` object from an API response.
 * @returns Trimmed message string, or `undefined` when none is found.
 */
function extractApiMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  const nestedError = record.error
  if (nestedError && typeof nestedError === 'object') {
    const nestedMessage = (nestedError as Record<string, unknown>).message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim()
    }
  }

  for (const key of ['message', 'detail', 'error']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return undefined
}

/**
 * Turns provider/API errors into a short user-facing message.
 *
 * @param error - Error thrown by the AI SDK or transport layer.
 * @returns A concise message suitable for the chat error banner.
 */
export function formatChatError(error: Error): string {
  if (APICallError.isInstance(error)) {
    const fromBody = extractApiMessage(error.responseBody)
    if (fromBody) return fromBody

    // AI SDK 5 sometimes leaves `message` empty but populates statusCode and
    // the URL — surface those instead of "Unknown error".
    if (error.statusCode) {
      const url = shortenUrl(error.url)
      return url
        ? `Request failed (${error.statusCode})${url}`
        : `Request failed with status ${error.statusCode}`
    }
  }

  const responseBody = (error as Error & { responseBody?: unknown })
    .responseBody
  const fromBody = extractApiMessage(responseBody)
  if (fromBody) return fromBody

  const message = error.message?.trim()
  if (message) {
    const jsonMatch = message.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const fromJson = extractApiMessage(parsed)
        if (fromJson) return fromJson
      } catch {
        // fall through to raw message
      }
    }
    return message
  }

  // error.message is empty — fall back to name / cause / stringified value so
  // the user sees something useful instead of "Unknown error".
  const name = error.name?.trim()
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error && cause.message?.trim()) {
    return cause.message.trim()
  }
  if (name && name !== 'Error') {
    return name
  }
  if (cause !== undefined) {
    return String(cause)
  }
  return String(error)
}

/**
 * Strips protocol and query string from a URL for display in error messages.
 *
 * @param url - Raw URL string from an API error.
 * @returns Shortened URL, or `undefined` when `url` is empty.
 */
function shortenUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return url
  }
}
