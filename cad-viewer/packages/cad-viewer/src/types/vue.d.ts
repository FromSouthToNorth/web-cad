declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, any>, any, any>
  export default component
}

declare module '@hy/cad-agent-plugin/style.css' {
  const css: string
  export default css
}

declare module '@hy/cad-search-plugin/style.css' {
  const css: string
  export default css
}
