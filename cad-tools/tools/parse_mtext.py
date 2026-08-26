# -*- coding: utf-8 -*-
"""
MTEXT 格式化字符串 → 纯文本 解析器

使用 ezdxf 原生 MTextParser 将 AutoCAD / 同类 CAD 的 MTEXT 格式化控制串
翻译为人类可读的最终显示效果, 保留段落换行与缩进。

处理规则:
  \\P            → 换行 (段落)
  \\S up^lwr ;   → 分数堆叠: up/lwr 用 ^ 分隔(横线), / 斜线, # 无分隔
                    上/下标场景: lwr 为空 → 仅显示上标(如 m³)
  \\~            → 不换行空格 (NBSP → 普通空格)
  \\T <n>;       → 制表符 (TAB)
  其它控制码     → 忽略 (字体/颜色/字高/对齐/上下划线等视觉属性)

用法:
  python cad-tools/tools/parse_mtext.py
"""

from __future__ import annotations

import copy
from typing import List

from ezdxf.tools.text import MTextParser, MTextContext, TokenType


# ---------------------------------------------------------------- 状态快照

class _PropState:
    """跟踪当前 MTEXT 渲染上下文, 便于扩展 (颜色/字体/粗体等标注)"""

    def __init__(self):
        self.font: str = ""          # 当前字体名
        self.color: int = 7          # ACI 颜色 (7 = 白/黑, 随背景反色)
        self.rgb: tuple | None = None
        self.height: float = 1.0     # 当前字高 (cap_height)
        self.width_factor: float = 1.0
        self.underline: bool = False
        self.strike: bool = False
        self.overline: bool = False
        self.bold: bool = False
        self.italic: bool = False
        self.align: str = "left"

    def apply(self, ctx: MTextContext) -> None:
        """从 MTextContext 同步当前状态"""
        self.color = ctx.aci
        self.rgb = ctx.rgb
        self.height = ctx.cap_height
        self.width_factor = ctx.width_factor
        self.underline = ctx.underline
        self.strike = ctx.strike_through
        self.overline = ctx.overline
        try:
            self.font = ctx.font_face.family or ""
        except Exception:
            pass
        # b0/i0 等粗斜体标记在 font_face 的 style 字段里
        try:
            style = ctx.font_face.style
            self.bold = "bold" in (style or "").lower() or "b" in (style or "")
            self.italic = "italic" in (style or "").lower() or "i" in (style or "")
        except Exception:
            pass


# ---------------------------------------------------------------- 堆叠渲染

def _render_stack(upr: str, lwr: str, sep: str) -> str:
    """渲染 \\S 堆叠指令:
      sep='^' → 横线分隔 (分数/上下标)
      sep='/' → 斜线分隔 (如 1/2)
      sep='#' → 无分隔, 纯上下叠放
    lwr 为空时, 视作上标 (如 m³/min).
    """
    if not lwr:
        # 上标场景: 直接输出上标字符
        return upr
    if sep == "/":
        return f"{upr}/{lwr}"
    if sep == "#":
        return f"{upr}{lwr}"
    # '^' 默认横线 → 用 '/' 表示 (终端无横线排版能力)
    return f"{upr}/{lwr}"


# ---------------------------------------------------------------- 主函数

def parse_mtext_to_plain(text: str) -> str:
    """将 MTEXT 格式化字符串翻译为纯文本, 保留段落与缩进.

    视觉属性 (颜色/字体/字高/上下划线等) 被丢弃, 仅保留文字内容与结构.
    """
    if not text:
        return ""

    parser = MTextParser(text)
    parts: List[str] = []
    state = _PropState()

    for tok in parser:
        t = tok.type
        data = tok.data

        if t == TokenType.WORD:
            # 文本片段: 应用当前修饰 (上下划线终端不可见, 仅记录)
            state.apply(tok.ctx)
            parts.append(data)

        elif t == TokenType.STACK:
            upr, lwr, sep = data
            parts.append(_render_stack(upr, lwr, sep))

        elif t == TokenType.SPACE:
            parts.append(" ")

        elif t == TokenType.NBSP:
            parts.append(" ")  # 不换行空格 → 普通空格

        elif t == TokenType.TABULATOR:
            parts.append("\t")

        elif t == TokenType.NEW_PARAGRAPH:
            parts.append("\n")

        elif t == TokenType.NEW_COLUMN:
            parts.append("\n")

        elif t == TokenType.WRAP_AT_DIMLINE:
            # 尺寸线换行, 视作段落
            parts.append("\n")

        elif t == TokenType.PROPERTIES_CHANGED:
            # 仅同步状态, 不输出
            state.apply(tok.ctx)

        # TokenType.NONE 忽略

    return "".join(parts)


# ---------------------------------------------------------------- 演示

if __name__ == "__main__":
    SAMPLES = [
        # 1. 风量单位 (堆叠上标 m³/min)
        r"\A1;\pxsm0.9224;\C7;风 量m\H10.8856045728698;{\H0.5x;\S3^ ;}\H12.4406909404226;\C256;/min\C7;\P\P\pxsm0.96,ql;\C256;\P",

        # 2. 分站说明 (颜色 + 段落)
        r"{\C1;1号分站(主驱动机房配电室)，在主驱动机房配电柜取电 }\P"
        r"{\C0;注：原煤仓上方甲烷报警值≥1.5%；\P    注氮机房氧气报警值≤18%\P    空压机温度报警值≥90℃；断电值≥100℃；复电值＜99℃。}\P"
        r"{\C1;2号分站(主通风机房)，在主通风机房配电柜取电 }\P"
        r"{\C0;风井底东\P翼回风巷}\P"
        r"{\C1;11号分站(C12300回风联巷掘进巷口)，在东翼1#4联巷配电点综保取电 }",

        # 3. 长文本 (字体切换 + 堆叠 + 段落 + 缩放)
        r"{\fFangSong|b0|i0|c134|p49;\C7;说明：\P"
        r"    1、本矿低瓦斯矿井，煤层易自燃，煤尘有爆炸危险性。\P"
        r"    3、甲烷传感器的报警、断电、复电浓度及断电范围为：\P"
        r"      1、\fFangSong|b0|i0|c0|p49; \fFangSong|b0|i0|c134|p49;"
        r"13303上隅角：报警浓度≥1.0%，断电浓度≥1.5%，复电浓度＜1.0%；\P"
        r"      3、\H1.074x; \H0.9311x;13303回风巷口：报警浓度≥1.0%，\H0.99989x;"
        r"\H1.00011x;本地断电:远控开关控制11盘区变电所102#/202#/106#高爆开关。}",
    ]

    for i, s in enumerate(SAMPLES, 1):
        print(f"\n{'='*60}\n样例 {i}\n{'='*60}")
        print(parse_mtext_to_plain(s))
