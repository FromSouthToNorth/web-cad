import enUS from 'ant-design-vue/es/locale/en_US'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import trTR from 'ant-design-vue/es/locale/tr_TR'
import csCZ from 'ant-design-vue/es/locale/cs_CZ'
import { theme as antdTheme } from 'ant-design-vue'

export type UiTheme = 'light' | 'dark'

/**
 * antd ConfigProvider theme derived from the app theme, matching the
 * `--ml-theme-*` palette (primary #3b82f6) used across the shell.
 */
export const buildAntdTheme = (theme: UiTheme) => ({
  algorithm:
    theme === 'dark'
      ? antdTheme.darkAlgorithm
      : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    colorInfo: '#3b82f6',
    borderRadius: 6,
    fontSize: 13
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
