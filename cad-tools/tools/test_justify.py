# -*- coding: utf-8 -*-
"""验证左对齐后文字渲染位置保持不变"""
import sys
sys.path.insert(0, r"cad-tools")
import math
import ezdxf
from ezdxf import bbox
from ezdxf.enums import TextEntityAlignment
from process_dxf import justify_left, Stats

doc = ezdxf.new("R2010")
doc.styles.add("宋体", font="simsun.ttf")
msp = doc.modelspace()

cases = []  # (描述, 原实体)

def add_text(content, align_enum, ap, h=20.0, w=1.0, rot=0.0):
    t = msp.add_text(content, dxfattribs={"style": "宋体", "height": h, "width": w, "rotation": rot})
    t.set_placement((0, 0), align=align_enum)  # 先随便放
    t.dxf.align_point = ap
    # 模拟真实图纸: 非左对齐时 insert 是无关旧值
    t.dxf.insert = (ap[0] + 7.3, ap[1] - 3.1, 0)
    cases.append((f"TEXT {align_enum.name} {content!r} rot={rot}", t))
    return t

add_text("防爆密闭门", TextEntityAlignment.CENTER, (1000, 500), h=20, w=0.9)
add_text("右下对齐ABC", TextEntityAlignment.BOTTOM_RIGHT, (800, 300), h=10)
add_text("正中风门", TextEntityAlignment.MIDDLE, (500, 500), h=27)
add_text("顶部对齐", TextEntityAlignment.TOP_LEFT, (100, 900), h=15)
add_text("旋转居中", TextEntityAlignment.CENTER, (1500, 1000), h=20, rot=45)
add_text("普通左对齐", TextEntityAlignment.LEFT, (0, 0), h=20)

# 记录转换前包围盒
before = {}
for name, e in cases:
    try:
        box = bbox.extents([e])
        before[e.dxf.handle] = (name, box)
    except Exception as ex:
        print(f"!! 包围盒计算失败 {name}: {ex}")

stats = Stats()
justify_left(doc, msp, stats)

# 组码 11 必须清除(== 组码 10), 否则前端在组码11有效时优先用旧对齐点做锚点
bad11 = [e.dxf.text for e in msp.query("TEXT")
         if abs(e.dxf.get("align_point", (0, 0, 0))[0] - e.dxf.insert.x) > 1e-9
         or abs(e.dxf.get("align_point", (0, 0, 0))[1] - e.dxf.insert.y) > 1e-9]
assert not bad11, f"组码11未清除: {bad11}"
print("组码11已全部清除(==插入点)")

print(f"转换: 左对齐={stats.justified} 警告={stats.warnings}")
ok = True
for e in msp.query("TEXT"):
    name, box0 = before.get(e.dxf.handle, (None, None))
    if e.dxftype() != "TEXT":
        continue
    try:
        box1 = bbox.extents([e])
    except Exception as ex:
        print(f"!! 转换后包围盒失败: {ex}")
        continue
    if box0 is None:
        continue
    d = max(abs(box1.extmin.x - box0.extmin.x), abs(box1.extmin.y - box0.extmin.y),
            abs(box1.extmax.x - box0.extmax.x), abs(box1.extmax.y - box0.extmax.y))
    tag = "OK " if d < 0.5 else "BAD"
    if d >= 0.5:
        ok = False
    print(f"{tag} {name}: 最大偏移={d:.3f}  insert=({e.dxf.insert.x:.1f},{e.dxf.insert.y:.1f})")

print("总体:", "通过" if ok else "存在超差")
