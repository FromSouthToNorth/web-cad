# -*- coding: utf-8 -*-
"""验证修复方案: 样条拟合多段线只取 flag&8 顶点
1. 全部样条拟合多段线: flag&8 顶点是否有凸度
2. B812D6/B9F1EA: 修复后线段数与自重叠检查
"""
import sys
import time
from collections import defaultdict

import ezdxf

sys.path.insert(0, "cad-tools")


def fixed_segments(e):
    """修复后的打散逻辑: 样条拟合多段线仅用 flag&8 顶点"""
    pts = [v.dxf.location for v in e.vertices if v.dxf.get("flags", 0) & 8]
    if not pts:
        return None
    if e.is_closed and pts and not pts[0].isclose(pts[-1], abs_tol=1e-6):
        pts = pts + [pts[0]]
    return [(a, b) for a, b in zip(pts, pts[1:]) if not a.isclose(b, abs_tol=1e-6)]


def main(src_path):
    t0 = time.time()
    doc = ezdxf.readfile(src_path)
    print(f"加载耗时: {time.time()-t0:.1f}s")

    bulge_on_8 = 0
    total_spline = 0
    for sp in [doc.modelspace()] + [bl for bl in doc.blocks
                                    if not bl.name.lower().startswith(("*model_space", "*paper_space"))]:
        for e in sp:
            if e.dxftype() != "POLYLINE":
                continue
            try:
                if not (e.dxf.get("flags", 0) & 4):
                    continue
            except Exception:
                continue
            total_spline += 1
            for v in e.vertices:
                if v.dxf.get("flags", 0) & 8 and v.dxf.get("bulge", 0.0):
                    bulge_on_8 += 1
    print(f"样条拟合多段线: {total_spline}, flag&8 顶点带凸度总数: {bulge_on_8}")

    for handle in ("B812D6", "B9F1EA"):
        e = doc.entitydb.get(handle)
        segs = fixed_segments(e)
        print(f"\n{handle}: 修复后线段数 = {len(segs)} (修复前 45)")
        # 自重叠检查
        def q(p, g=1e-3):
            return (round(p.x / g), round(p.y / g), round(p.z / g))
        grid = defaultdict(list)
        for i, (a, b) in enumerate(segs):
            grid[q(a)].append(i)
            grid[q(b)].append(i)
        dup = 0
        for idxs in grid.values():
            for x in range(len(idxs)):
                for y in range(x + 1, len(idxs)):
                    i, j = idxs[x], idxs[y]
                    if i == j:
                        continue
                    a, b = segs[i]
                    c, d = segs[j]
                    if (a.isclose(c, abs_tol=2e-3) and b.isclose(d, abs_tol=2e-3)) or \
                       (a.isclose(d, abs_tol=2e-3) and b.isclose(c, abs_tol=2e-3)):
                        dup += 1
        print(f"  修复后自重叠段对数: {dup}")
        # 闭合缺口
        sp_pts = [v.dxf.location for v in e.vertices if v.dxf.get("flags", 0) & 8]
        gap = (sp_pts[0] - sp_pts[-1]).magnitude
        print(f"  样条顶点首尾缺口(由闭合段近似): {gap:.3f}m")


if __name__ == "__main__":
    main(sys.argv[1])
