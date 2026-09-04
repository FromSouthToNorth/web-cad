# -*- coding: utf-8 -*-
"""全文件统计: 曲线拟合/样条拟合多段线数量与影响; 抽查曲线拟合多段线的顶点排布"""
import sys
import time
from collections import Counter

import ezdxf


def main(src_path):
    t0 = time.time()
    doc = ezdxf.readfile(src_path)
    print(f"加载耗时: {time.time()-t0:.1f}s")

    spline_fit = []   # flags & 4
    curve_fit = []    # flags & 2
    spaces = [doc.modelspace()]
    for bl in doc.blocks:
        if bl.name.lower().startswith(("*model_space", "*paper_space")):
            continue
        spaces.append(bl)
    for sp in spaces:
        for e in sp:
            if e.dxftype() != "POLYLINE":
                continue
            try:
                flags = e.dxf.get("flags", 0)
                if flags & 4:
                    spline_fit.append(e)
                elif flags & 2:
                    curve_fit.append(e)
            except Exception:
                pass

    print(f"\n样条拟合多段线(flags&4): {len(spline_fit)} 个")
    if spline_fit:
        spurious = 0
        ok_vs = 0
        for e in spline_fit:
            n16 = sum(1 for v in e.vertices if v.dxf.get("flags", 0) & 16)
            n8 = sum(1 for v in e.vertices if v.dxf.get("flags", 0) & 8)
            spurious += n16 + (1 if e.is_closed else 0)
            ok_vs += n8
        print(f"  其中样条顶点(应保留)总数: {ok_vs}, 框架控制点(应剔除)总数: "
              f"{sum(1 for e in spline_fit for v in e.vertices if v.dxf.get('flags',0)&16)}")
        print(f"  估计打散后产生的多余直线段(约): {spurious}")

    print(f"\n曲线拟合多段线(flags&2): {len(curve_fit)} 个")
    if curve_fit:
        flag_dist = Counter()
        for e in curve_fit:
            for v in e.vertices:
                flag_dist[v.dxf.get("flags", 0)] += 1
        print(f"  VERTEX flag 分布: {dict(flag_dist)}")
        # 抽查前 3 个: 顶点类型序列
        for e in curve_fit[:3]:
            seq = "".join("1" if v.dxf.get("flags", 0) & 1 else "0" for v in e.vertices)
            print(f"    {e.dxf.handle}: 顶点序列 0=控制点 1=拟合点: {seq[:80]}")
            # 拟合点(flag&1)是否按序首尾相接?
            fit = [v.dxf.location for v in e.vertices if v.dxf.get("flags", 0) & 1]
            if fit:
                d = (fit[0] - fit[-1]).magnitude
                print(f"      拟合点数={len(fit)}, 首尾距离={d:.3f}")

    # 样条拟合多段线顶点序列抽查(前3个)
    print("\n样条拟合多段线顶点序列抽查:")
    for e in spline_fit[:3]:
        seq = "".join("C" if v.dxf.get("flags", 0) & 16 else "8" for v in e.vertices)
        print(f"  {e.dxf.handle} (layer={e.dxf.layer}, closed={e.is_closed}, "
              f"顶点数={len(seq)}): {seq[:60]}")


if __name__ == "__main__":
    main(sys.argv[1])
