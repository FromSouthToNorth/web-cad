# -*- coding: utf-8 -*-
"""验证重新解析后的输出: 多余框架连线消失, 样条拟合多段线全部打断"""
import sys
import time
from collections import defaultdict

import ezdxf


def load_grid(out, layer):
    grid = defaultdict(list)
    for e in out.modelspace().query("LINE"):
        if e.dxf.layer == layer:
            for pt in (e.dxf.start, e.dxf.end):
                grid[(round(pt.x, 2), round(pt.y, 2), round(pt.z, 2))].append(e)
    return grid


def seg_exists(grid, a, b, tol=0.02):
    cand = set()
    for pt in (a, b):
        cand.update(grid.get((round(pt[0], 2), round(pt[1], 2), round(pt[2], 2)), []))
    for e in cand:
        s, t = e.dxf.start, e.dxf.end
        if (a.isclose(s, abs_tol=tol) and b.isclose(t, abs_tol=tol)) or \
           (a.isclose(t, abs_tol=tol) and b.isclose(s, abs_tol=tol)):
            return True
    return False


def main(src_path, out_path):
    t0 = time.time()
    src = ezdxf.readfile(src_path)
    print(f"源文件加载: {time.time()-t0:.1f}s")
    t0 = time.time()
    out = ezdxf.readfile(out_path)
    print(f"输出文件加载: {time.time()-t0:.1f}s")

    msp = out.modelspace()
    print(f"输出模型空间实体: {len(msp)} (修复前 457951)")
    n_pl = sum(1 for e in msp if e.dxftype() in ("POLYLINE", "LWPOLYLINE"))
    n_spline = sum(1 for e in msp if e.dxftype() == "POLYLINE"
                   and (e.dxf.get("flags", 0) & 4))
    print(f"输出中残留多段线: {n_pl}, 其中样条拟合: {n_spline}")

    for handle in ("B812D6", "B9F1EA"):
        ent = src.entitydb.get(handle)
        layer = ent.dxf.layer
        vs = list(ent.vertices)
        pts = [v.dxf.location for v in vs]
        flags = [v.dxf.get("flags", 0) for v in vs]
        n = len(pts)
        grid = load_grid(out, layer)
        # 修复前多余段: 含框架控制点(flag&16)的段
        bad = []
        for i in range(n):
            if flags[i] & 16 or flags[(i + 1) % n] & 16:
                bad.append((pts[i], pts[(i + 1) % n]))
        found_bad = sum(1 for a, b in bad if seg_exists(grid, a, b))
        # 修复后新增闭合段: 最后一个样条顶点 -> 第一个样条顶点
        sp = [v.dxf.location for v in vs if v.dxf.get("flags", 0) & 8]
        closing = (sp[-1], sp[0])
        has_closing = seg_exists(grid, *closing)
        # 样条弦抽查: 应全部存在
        n_ok = sum(1 for i in range(len(sp) - 1) if seg_exists(grid, sp[i], sp[i + 1]))
        print(f"\n{handle} ({layer}):")
        print(f"  修复前多余框架连线 {found_bad}/{len(bad)} 存在 (应为 0)")
        print(f"  新闭合段存在: {has_closing} (应为 True)")
        print(f"  样条弦抽查存在: {n_ok}/{len(sp)-1}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
