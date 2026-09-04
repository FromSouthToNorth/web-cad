# -*- coding: utf-8 -*-
"""探查 B812D6(计曲线) / B9F1EA(DGX): 顶点构成、曲线拟合标志、打散线段重叠分析"""
import sys
import time
from collections import Counter, defaultdict

import ezdxf
from ezdxf import path

sys.path.insert(0, "cad-tools")
from process_dxf import (
    polyline_straight_segments, lwpolyline_straight_segments, flatten_path_to_lines,
)


def describe_polyline(e):
    d = e.dxf
    print(f"\n=== {e.dxf.handle} 类型={e.dxftype()} 图层={d.layer} ===")
    print(f"  flags={d.get('flags', 0)} closed={e.is_closed}")
    if e.dxftype() == "LWPOLYLINE":
        pts = list(e.get_points("xyb"))
        print(f"  顶点数: {len(pts)}  有凸度顶点数: {sum(1 for p in pts if p[2])}")
        return
    vs = list(e.vertices)
    print(f"  顶点总数: {len(vs)}")
    flag_counter = Counter()
    bulge_counter = 0
    for i, v in enumerate(vs):
        f = v.dxf.get("flags", 0)
        flag_counter[f] += 1
        if v.dxf.get("bulge", 0.0):
            bulge_counter += 1
        loc = v.dxf.location
        if i < 8 or i >= len(vs) - 3:
            print(f"    [{i}] flag={f} bulge={v.dxf.get('bulge', 0.0)!r} "
                  f"loc=({loc.x:.6f},{loc.y:.6f},{loc.z:.6f})")
    print(f"  VERTEX flag 分布: {dict(flag_counter)}  含凸度顶点数: {bulge_counter}")


def analyze(e):
    """模拟 process_dxf 打散, 检查输出线段之间的重叠"""
    attribs = {"layer": e.dxf.layer}
    # 1. 快速路径
    try:
        if e.dxftype() == "LWPOLYLINE":
            segs = lwpolyline_straight_segments(e)
        else:
            segs = polyline_straight_segments(e)
    except Exception as ex:
        segs = None
    print(f"  快速路径结果: {'None(走曲线离散)' if segs is None else f'{len(segs)} 条线段'}")
    # 2. 慢速路径 (path.make_path + flattening)
    p = path.make_path(e)
    flat = flatten_path_to_lines(p)
    print(f"  path.flattening 点数: {len(list(p.flattening(0.05)))}, 线段数: {len(flat)}")

    # 3. 控制顶点直连 (对比: 若多段线是曲线拟合, 控制顶点直连就是"多余的直线")
    if e.dxftype() == "POLYLINE":
        pts = [v.dxf.location for v in e.vertices]
        direct = [(a, b) for a, b in zip(pts, pts[1:])]
        if e.is_closed and pts:
            direct.append((pts[-1], pts[0]))
        print(f"  全部顶点直连线段数: {len(direct)}")

        # 仅控制顶点 (flag 不含 1) 直连
        ctrl = [v.dxf.location for v in e.vertices if not (v.dxf.get("flags", 0) & 1)]
        cd = [(a, b) for a, b in zip(ctrl, ctrl[1:])]
        print(f"  仅控制顶点(flag&1==0): {len(ctrl)} 个, 直连线段 {len(cd)} 条")
        # 仅拟合顶点 (flag&1)
        fit = [v.dxf.location for v in e.vertices if v.dxf.get("flags", 0) & 1]
        fd = [(a, b) for a, b in zip(fit, fit[1:])]
        print(f"  仅拟合顶点(flag&1): {len(fit)} 个, 直连线段 {len(fd)} 条")

    # 4. 打散线段内自重叠检查 (量化网格)
    def q(p, g):
        return (round(p.x / g), round(p.y / g), round(p.z / g))
    for grid_size in (1e-4, 1e-3):
        grid = defaultdict(list)
        for i, (a, b) in enumerate(flat):
            for pt in (a, b):
                grid[q(pt, grid_size)].append(i)
        dup_pairs = set()
        for idxs in grid.values():
            for i in idxs:
                for j in idxs:
                    if i < j:
                        dup_pairs.add((i, j))
        # 确认是整段重合
        truly_dup = 0
        for i, j in dup_pairs:
            a, b = flat[i]
            c, d = flat[j]
            if (a.isclose(c, abs_tol=2 * grid_size) and b.isclose(d, abs_tol=2 * grid_size)) or \
               (a.isclose(d, abs_tol=2 * grid_size) and b.isclose(c, abs_tol=2 * grid_size)):
                truly_dup += 1
        print(f"  flattening 自重叠段对 (网格={grid_size}): {truly_dup}")

    return flat


def main(src_path):
    t0 = time.time()
    doc = ezdxf.readfile(src_path)
    print(f"加载耗时: {time.time()-t0:.1f}s, 模型空间实体: {len(doc.modelspace())}")

    for handle in ("B812D6", "B9F1EA"):
        ent = doc.entitydb.get(handle)
        if ent is None:
            print(f"\n[{handle}] 不存在")
            continue
        describe_polyline(ent)
        analyze(ent)


if __name__ == "__main__":
    main(sys.argv[1])
