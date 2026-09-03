import { reactive } from 'vue'

export const store = reactive({
  dialogs: {
    layerManager: false,
    activePaletteTab: 'layerManager'
  },
  features: {
    /** Set when `@mlightcad/cad-agent-plugin` is installed and registered. */
    agentPlugin: false,
    /** Set when `@mlightcad/cad-search-plugin` is installed and registered. */
    searchPlugin: false
  }
})
