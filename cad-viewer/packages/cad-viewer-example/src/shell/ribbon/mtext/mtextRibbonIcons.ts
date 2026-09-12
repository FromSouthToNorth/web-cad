import { type Component, defineComponent, h } from 'vue'

/**
 * Icon set for the MTEXT contextual ribbon.
 *
 * The glyphs are inlined SVG paths (rather than an icon font) so the format
 * panel renders identically offline and inside the compact ribbon. Each raw
 * string is normalised to `1em` and `currentColor` by {@link svgIcon}, which
 * lets the shared ribbon CSS control sizing and hover colors.
 */
const mtextIconPaths = {
  bold: '<svg viewBox="0 0 24 24"><path d="M7.8 19c-.3 0-.5 0-.6-.2l-.2-.5V5.7c0-.2 0-.4.2-.5l.6-.2h5c1.5 0 2.7.3 3.5 1 .7.6 1.1 1.4 1.1 2.5a3 3 0 0 1-.6 1.9c-.4.6-1 1-1.6 1.2.4.1.9.3 1.3.6s.8.7 1 1.2c.4.4.5 1 .5 1.6 0 1.3-.4 2.3-1.3 3-.8.7-2.1 1-3.8 1H7.8Zm5-8.3c.6 0 1.2-.1 1.6-.5.4-.3.6-.7.6-1.3 0-1.1-.8-1.7-2.3-1.7H9.3v3.5h3.4Zm.5 6c.7 0 1.3-.1 1.7-.4.4-.4.6-.9.6-1.5s-.2-1-.7-1.4c-.4-.3-1-.4-2-.4H9.4v3.8h4Z" fill-rule="evenodd"></path></svg>',
  italic:
    '<svg viewBox="0 0 24 24"><path d="m16.7 4.7-.1.9h-.3c-.6 0-1 0-1.4.3-.3.3-.4.6-.5 1.1l-2.1 9.8v.6c0 .5.4.8 1.4.8h.2l-.2.8H8l.2-.8h.2c1.1 0 1.8-.5 2-1.5l2-9.8.1-.5c0-.6-.4-.8-1.4-.8h-.3l.2-.9h5.8Z" fill-rule="evenodd"></path></svg>',
  underline:
    '<svg viewBox="0 0 24 24"><path d="M16 5c.6 0 1 .4 1 1v5.5a4 4 0 0 1-.4 1.8l-1 1.4a5.3 5.3 0 0 1-5.5 1 5 5 0 0 1-1.6-1c-.5-.4-.8-.9-1.1-1.4a4 4 0 0 1-.4-1.8V6c0-.6.4-1 1-1s1 .4 1 1v5.5c0 .3 0 .6.2 1l.6.7a3.3 3.3 0 0 0 2.2.8 3.4 3.4 0 0 0 2.2-.8c.3-.2.4-.5.6-.8l.2-.9V6c0-.6.4-1 1-1ZM8 17h8c.6 0 1 .4 1 1s-.4 1-1 1H8a1 1 0 0 1 0-2Z" fill-rule="evenodd"></path></svg>',
  overline:
    '<svg viewBox="0 0 24 24"><path d="M5 4h14v1.5H5V4zm7 3.5c3.04 0 5.5 2.46 5.5 5.5v4.5h-2.25v-4.5c0-1.79-1.46-3.25-3.25-3.25S8.75 11.21 8.75 13v4.5H6.5V13c0-3.04 2.46-5.5 5.5-5.5z"></path></svg>',
  strike:
    '<svg viewBox="0 0 24 24"><g fill-rule="evenodd"><path d="M15.6 8.5c-.5-.7-1-1.1-1.3-1.3-.6-.4-1.3-.6-2-.6-2.7 0-2.8 1.7-2.8 2.1 0 1.6 1.8 2 3.2 2.3 4.4.9 4.6 2.8 4.6 3.9 0 1.4-.7 4.1-5 4.1A6.2 6.2 0 0 1 7 16.4l1.5-1.1c.4.6 1.6 2 3.7 2 1.6 0 2.5-.4 3-1.2.4-.8.3-2-.8-2.6-.7-.4-1.6-.7-2.9-1-1-.2-3.9-.8-3.9-3.6C7.6 6 10.3 5 12.4 5c2.9 0 4.2 1.6 4.7 2.4l-1.5 1.1Z"></path><path d="M5 11h14a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z" fill-rule="nonzero"></path></g></svg>',
  superscript:
    '<svg viewBox="0 0 24 24"><path d="M15 9.4 10.4 14l4.6 4.6-1.4 1.4L9 15.4 4.4 20 3 18.6 7.6 14 3 9.4 4.4 8 9 12.6 13.6 8 15 9.4Zm5.9 1.6h-5v-1l1-.8 1.7-1.6c.3-.5.5-.9.5-1.3 0-.3 0-.5-.2-.7-.2-.2-.5-.3-.9-.3l-.8.2-.7.4-.4-1.2c.2-.2.5-.4 1-.5.3-.2.8-.2 1.2-.2.8 0 1.4.2 1.8.6.4.4.6 1 .6 1.6 0 .5-.2 1-.5 1.5l-1.3 1.4-.6.5h2.6V11Z" fill-rule="nonzero"></path></svg>',
  subscript:
    '<svg viewBox="0 0 24 24"><path d="m10.4 10 4.6 4.6-1.4 1.4L9 11.4 4.4 16 3 14.6 7.6 10 3 5.4 4.4 4 9 8.6 13.6 4 15 5.4 10.4 10ZM21 19h-5v-1l1-.8 1.7-1.6c.3-.4.5-.8.5-1.2 0-.3 0-.6-.2-.7-.2-.2-.5-.3-.9-.3a2 2 0 0 0-.8.2l-.7.3-.4-1.1 1-.6 1.2-.2c.8 0 1.4.3 1.8.7.4.4.6.9.6 1.5s-.2 1.1-.5 1.6a8 8 0 0 1-1.3 1.3l-.6.6h2.6V19Z" fill-rule="nonzero"></path></svg>',
  stack:
    '<svg viewBox="0 0 24 24"><path d="M12.4 5.4c.4 0 .8.1 1.2.4.4.2.7.6.9 1 .2.4.3.9.3 1.5s-.1 1.1-.3 1.6c-.2.4-.5.8-.9 1-.4.2-.8.3-1.2.3-.4 0-.7-.1-1-.3-.3-.2-.6-.4-.8-.8l-.1 1h-.8V3h.9v3.4c.2-.3.5-.6.8-.7.3-.2.6-.3 1-.3Zm-.1 5c.5 0 .8-.2 1.1-.5.3-.4.4-.9.4-1.6 0-.6-.1-1.1-.4-1.5-.3-.3-.6-.5-1.1-.5s-.8.2-1.2.5c-.3.3-.5.8-.5 1.5 0 .5.1.9.2 1.2.2.3.4.5.7.7.2.1.5.2.8.2Z"></path><path d="M12.1 15c.6 0 1.1.1 1.5.5.4.4.6.9.6 1.6v3.5h-.8l-.1-.7c-.2.3-.4.5-.7.6-.3.2-.6.2-.9.2-.4 0-.7-.1-1-.2-.3-.1-.5-.3-.7-.6-.2-.2-.2-.5-.2-.9 0-.5.2-1 .6-1.3.4-.3 1-.5 1.7-.5.4 0 .8.1 1.2.2v-.1c0-.5-.1-.9-.3-1.1-.2-.3-.5-.4-.9-.4-.3 0-.6.1-.8.2-.2.1-.4.3-.5.6l-.7-.4c.2-.4.4-.7.8-.9.4-.2.8-.3 1.2-.3Zm1.2 3.2c-.4-.1-.8-.2-1.2-.2s-.8.1-1 .3c-.3.1-.4.4-.4.7 0 .3.1.5.3.7.2.1.5.2.8.2.4 0 .8-.1 1.1-.4.2-.2.4-.6.4-1v-.3Z"></path><rect x="6" y="12.7" width="12" height=".8"></rect></svg>',
  case: '<svg viewBox="0 0 24 24"><path d="M4 18h2.1l1-2.8h4.2l1 2.8h2.2L10.5 6H8L4 18Zm3.8-4.6 1.4-4.1 1.4 4.1H7.8Zm8 4.6h1.8v-1.5c.5 1.1 1.4 1.7 2.6 1.7 1.7 0 2.8-1.1 2.8-2.7 0-1.7-1.2-2.6-3.2-2.6h-2v-.3c0-1 .6-1.5 1.6-1.5.8 0 1.4.3 1.8 1l1.4-.9c-.6-1.1-1.7-1.7-3.2-1.7-2.1 0-3.4 1.2-3.4 3.1V18Zm3.9-1.4c-1.1 0-1.8-.5-1.8-1.2 0-.7.6-1.1 1.8-1.1h1.5v.5c0 1.1-.6 1.8-1.5 1.8Z"></path></svg>',
  align:
    '<svg viewBox="0 0 24 24"><path d="M4 4h16v2H4V4Zm0 4h12v2H4V8Zm0 4h16v2H4v-2Zm0 4h12v2H4v-2Zm0 4h16v2H4v-2Z"></path></svg>',
  bullets:
    '<svg viewBox="0 0 24 24"><path d="M6 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm16-1H9v2h13V6ZM6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm16-1H9v2h13v-2ZM6 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm16-1H9v2h13v-2Z"></path></svg>',
  lineSpacing:
    '<svg viewBox="0 0 24 24"><path d="M8 5h13v2H8V5Zm0 6h13v2H8v-2Zm0 6h13v2H8v-2ZM3 5l2-2 2 2H5.8v14H7l-2 2-2-2h1.2V5H3Z"></path></svg>',
  symbol:
    '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 2.1-.9 4-2.3 5.3l-1.4-1.4A5 5 0 1 0 7 9c0 1.9 1 3.5 2.5 4.4V11h2v7h-2v-2.4A7 7 0 0 1 12 2Zm5 15h2v5h-2v-5Zm-4-2h2v7h-2v-7Z"></path></svg>',
  paragraphDefault:
    '<svg viewBox="0 0 24 24"><path d="M5 5h14v2H5V5Zm0 4h10v2H5V9Zm0 4h14v2H5v-2Zm0 4h10v2H5v-2Z"></path></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5Zm0 4h11v2H4V9Zm0 4h16v2H4v-2Zm0 4h11v2H4v-2Z"></path></svg>',
  center:
    '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5Zm3 4h10v2H7V9Zm-3 4h16v2H4v-2Zm3 4h10v2H7v-2Z"></path></svg>',
  right:
    '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5Zm5 4h11v2H9V9Zm-5 4h16v2H4v-2Zm5 4h11v2H9v-2Z"></path></svg>',
  justify:
    '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5Zm0 4h16v2H4V9Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z"></path></svg>',
  distributed:
    '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4V5Zm0 4h16v2H4V9Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Zm-2-1 2 2-2 2v-4Zm20 0v4l-2-2 2-2Z"></path></svg>'
} as const

/**
 * Wraps a raw SVG string in a Vue component that inherits the current color.
 *
 * @param svg - Raw SVG markup for one ribbon icon.
 * @returns A component that renders the icon at `1em` square.
 */
function svgIcon(svg: string): Component {
  const normalized = svg.replace(
    '<svg ',
    '<svg width="1em" height="1em" fill="currentColor" aria-hidden="true" '
  )
  return defineComponent({
    name: 'MTextRibbonSvgIcon',
    setup() {
      return () =>
        h('span', {
          class: 'antd-mtext-icon',
          innerHTML: normalized
        })
    }
  })
}

/** MTEXT ribbon icons keyed by their semantic name. */
export const mtextIcons = Object.fromEntries(
  Object.entries(mtextIconPaths).map(([key, svg]) => [key, svgIcon(svg)])
) as Record<keyof typeof mtextIconPaths, Component>

/** Icon key of {@link mtextIcons}. */
export type MTextIconName = keyof typeof mtextIconPaths
