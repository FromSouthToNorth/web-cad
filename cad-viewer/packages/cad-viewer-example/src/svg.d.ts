// Type declarations for SVG imports via vite-svg-loader.
// The loader transforms .svg files into Vue components at build time,
// but vite/client types declare them as strings. This override corrects that.
declare module '*.svg' {
  import type { FunctionalComponent, SVGAttributes } from 'vue'
  const component: FunctionalComponent<SVGAttributes>
  export default component
}

declare module '*.svg?raw' {
  const content: string
  export default content
}
