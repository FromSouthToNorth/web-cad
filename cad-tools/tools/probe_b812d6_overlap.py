# -*- coding: utf-8 -*-
"""验证: 样条拟合多段线打散后, 框架控制点连线与真实样条弦的重叠
1. 拆分 B812D6/B9F1EA 打散的 45 段为 '好段'(样条顶点弦) 与 '坏段'(框架控制点连线)
2. 检查坏段与好段的部分重叠(共线且区间重叠)
3. 在输出文件中确认坏段是否真实作为 LINE 存在
"""
import sys
import time
import math
from collections import defaultdict

import ezdxf
from ezdxf import path

sys.path.insert(0, "cad-tools")
from process_dxf import flatten_path_to_lines


def seg_overlap(a, b, c, d, tol=0.02):
    """判断线段 ab 与 cd 是否共线且区间有重叠, 返回重叠长度"""
    def unit(v):
        m = v.magnitude
        return v / m if m > 1e-12 else None
    u = unit(b - a)
    if u is None:
        return 0.0
    # c,d 到 ab 所在直线的垂距
    for p in (c, d):
        perp = (p - a).magnitude ** 2 - ((p - a).dot(u)) ** 2
        if perp > tol * tol:
            return 0.0
    t = [(c - a).dot(u), (d - a).dot(u)]
    lo, hi = sorted(t)
    L = (b - a).magnitude
    ov = min(hi, L) - max(lo, 0.0)
    return ov if ov > tol else 0.0


def analyze(handle, ent, out_doc=None):
    vs = list(ent.vertices)
    loc = [v.dxf.location for v in vs]
    flags = [v.dxf.get("flags", 0) for v in vs]
    pts = loc
    n = len(pts)
    # process_dxf 实际输出: 全部顶点顺序连线 + 闭合
    segs = [(pts[i], pts[(i + 1) % n]) for i in range(n)]
    good, bad = [], []
    for i, (a, b) in enumerate(segs):
        if flags[i] & 8 and flags[(i + 1) % n] & 8:
            good.append((i, a, b))
        else:
            bad.append((i, a, b))
    print(f"\n=== {handle} (layer={ent.dxf.layer}) ===")
    print(f"  打散总段数: {len(segs)}  好段(样条弦): {len(good)}  坏段(含控制点): {len(bad)}")
    # 坏段与好段的部分重叠
    total_ov = 0.0
    for i, a, b in bad:
        for j, c, d in good:
            ov = seg_overlap(a, b, c, d)
            if ov > 0:
                print(f"    [重叠] 坏段[{i}] ({a.x:.3f},{a.y:.3f})->({b.x:.3f},{b.y:.3f}) "
                      f"与好段[{j}] 重叠 {ov:.2f}m (坏段长 {(b-a).magnitude:.2f}m)")
                total_ov += ov
    print(f"  坏段与好段重叠总长: {total_ov:.2f}m")

    if out_doc is None:
        return
    # 输出文件中查找坏段端点匹配的 LINE
    def q(p, g=0.005):
        return (round(p.x / g), round(p.y / g), round(p.z / g))
    grid = defaultdict(list)
    for e in out_doc.modelspace().query("LINE"):
        if e.dxf.layer != ent.dxf.layer:
            continue
        for pt in (e.dxf.start, e.dxf.end):
            grid[q(pt)].append(e)
    found, missing = 0, 0
    for i, a, b in bad:
        cand = set()
        for pt in (a, b):
            for e in grid.get(q(pt), []):
                cand.add(e)
        ok = False
        for e in cand:
            s, t = e.dxf.start, e.dxf.end
            if (a.isclose(s, abs_tol=0.01) and b.isclose(t, abs_tol=0.01)) or \
               (a.isclose(t, abs_tol=0.01) and b.isclose(s, abs_tol=0.01)):
                ok = True
                break
        if ok:
            found += 1
        else:
            missing += 1
            print(f"    [输出缺失] 坏段[{i}] ({a.x:.3f},{a.y:.3f})->({b.x:.3f},{b.y:.3f})")
    print(f"  输出文件中坏段存在 {found}/{len(bad)}")


def main(src_path, out_path):
    t0 = time.time()
    doc = ezdxf.readfile(src_path)
    print(f"源文件加载: {time.time()-t0:.1f}s")
    t0 = time.time()
    out = ezdxf.readfile(out_path)
    print(f"输出文件加载: {time.time()-t0:.1f}s, 模型空间实体: {len(out.modelspace())}")
    for handle in ("B812D6", "B9F1EA"):
        analyze(handle, doc.entitydb.get(handle), out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
