import { AcApLayerCtxPlugin } from './AcApLayerCtxPlugin'

/**
 * Creates an object context-menu plugin instance.
 *
 * @returns A new {@link AcApLayerCtxPlugin} instance
 */
export async function createLayerCtxPlugin() {
  return new AcApLayerCtxPlugin()
}
