import { AcApTunnelPlugin } from './AcApTunnelPlugin'
import type { TunnelDrawOptions } from './config'

/**
 * Creates a tunnel plugin instance.
 *
 * @param options - Optional defaults for the `drawtunnel` command.
 * @returns A new {@link AcApTunnelPlugin} instance
 */
export async function createTunnelPlugin(options?: TunnelDrawOptions) {
  return new AcApTunnelPlugin(options)
}
