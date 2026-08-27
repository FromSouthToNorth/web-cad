import { AcApSearchPlugin } from './AcApSearchPlugin'

/**
 * Creates a content search plugin instance.
 *
 * @returns A promise that resolves to a new {@link AcApSearchPlugin}.
 */
export async function createSearchPlugin() {
  return new AcApSearchPlugin()
}
