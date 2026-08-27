import { AcApInvertSelPlugin } from './AcApInvertSelPlugin'

/**
 * Creates an invert-selection plugin instance.
 *
 * @returns A new {@link AcApInvertSelPlugin} instance
 */
export async function createInvertSelPlugin() {
  return new AcApInvertSelPlugin()
}
