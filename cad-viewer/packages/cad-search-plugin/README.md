# @mlightcad/cad-search-plugin

Content search palette plugin for cad-viewer.

Searches text content of TEXT / MTEXT / ATTRIB / MLEADER / DIMENSION entities
in model space with fuzzy matching. Clicking a result selects and highlights
the entity and zooms the view to it.

## Usage

```ts
import { registerLazySearchPlugin } from '@mlightcad/cad-search-plugin/register'

registerLazySearchPlugin(pluginManager)
```

The plugin loads lazily on first use of the `search` (or `find`) command.
