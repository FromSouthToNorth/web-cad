import type { Component } from 'vue'

/**
 * AutoCAD-style ribbon data model.
 *
 * Every ribbon tab contains panels; each panel holds a flat list of items
 * that may be large (icon + label, the primary tools) or small (icon only,
 * secondary tools arranged in a wrapping grid).  Items can also be dropdown
 * buttons (a large main action with a popup menu of variants).
 */

// ── item size ────────────────────────────────────────────────────────

export type RibbonItemSize = 'large' | 'small'

// ── dropdown option ──────────────────────────────────────────────────

export interface RibbonDropdownOption {
  id: string
  command: string
  icon?: Component
  label: string
  tooltip?: string
}

// ── button ───────────────────────────────────────────────────────────

export interface RibbonButtonDef {
  type: 'button'
  id: string
  command: string
  icon?: Component
  label: string
  size?: RibbonItemSize
  /** When present the button acts as a two-state toggle. */
  toggle?: {
    activeIcon?: Component
    getValue?: () => boolean
  }
  /** Alt-key shortcut hint (single character, e.g. 'L' for LINE). */
  keyTip?: string
}

// ── dropdown button ──────────────────────────────────────────────────

export interface RibbonDropdownDef {
  type: 'dropdown'
  id: string
  /** The command dispatched when clicking the main body (default option). */
  command: string
  icon?: Component
  label: string
  size?: RibbonItemSize
  options: RibbonDropdownOption[]
  keyTip?: string
}

// ── union ────────────────────────────────────────────────────────────

export type RibbonItemDef = RibbonButtonDef | RibbonDropdownDef

// ── panel ────────────────────────────────────────────────────────────

export interface RibbonPanelDef {
  id: string
  title: string
  items: RibbonItemDef[]
}

// ── tab ──────────────────────────────────────────────────────────────

export interface RibbonContextualConfig {
  /** CSS colour for the header highlight strip. */
  color: string
  /** exclusive = only while command runs; selection = while objects selected. */
  mode: 'exclusive' | 'selection'
  /** CAD command names that activate this contextual tab. */
  commands: string[]
}

export interface RibbonTabDef {
  id: string
  title: string
  panels: RibbonPanelDef[]
  contextual?: RibbonContextualConfig
}

// ── QAT (Quick Access Toolbar) ───────────────────────────────────────

export interface QatItemDef {
  id: string
  command: string
  icon?: Component
  label: string
}

// ── file menu ────────────────────────────────────────────────────────

export interface RibbonFileItemDef {
  id: string
  command: string
}

// ── enhanced tooltip ─────────────────────────────────────────────────

export interface RibbonTooltipDef {
  /** First line: command name. */
  title: string
  /** Shortcut hint, e.g. "L". */
  shortcut?: string
  /** One-line description. */
  description?: string
}
