import enUS from 'ant-design-vue/es/locale/en_US'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import trTR from 'ant-design-vue/es/locale/tr_TR'
import csCZ from 'ant-design-vue/es/locale/cs_CZ'
import { theme as antdTheme } from 'ant-design-vue'

export type UiTheme = 'light' | 'dark'

/**
 * antd ConfigProvider theme derived from the app theme, matching the
 * `--ml-theme-*` palette (primary #3b82f6) used across the shell.
 *
 * Values mirror the design tokens in `@mlightcad/cad-viewer` style/index.scss
 * (--ml-radius-md, --ml-space-*). The whole shell renders at antd's `small`
 * component size so the compact CAD density comes from tokens instead of
 * per-component `!important` height overrides.
 */
export const buildAntdTheme = (theme: UiTheme) => ({
  algorithm:
    theme === 'dark'
      ? antdTheme.darkAlgorithm
      : antdTheme.defaultAlgorithm,
  componentSize: 'small' as const,
  token: {
    colorPrimary: '#3b82f6',
    colorInfo: '#3b82f6',
    // --ml-radius-md
    borderRadius: 6,
    // Ant baseline; density comes from componentSize instead of a smaller base
    fontSize: 14
  }
})

/**
 * antd component locale matching the viewer's effective locale
 * (`en` | `zh` | `tr` | `cs`); anything else falls back to English.
 */
export const antdLocaleFor = (locale: string) => {
  switch (locale) {
    case 'zh':
      return zhCN
    case 'tr':
      return trTR
    case 'cs':
      return csCZ
    default:
      return enUS
  }
}
