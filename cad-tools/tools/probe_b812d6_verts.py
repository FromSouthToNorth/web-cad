# -*- coding: utf-8 -*-
"""打印 B812D6 / B9F1EA 全部顶点顺序与 flag, 分析样条拟合顶点(8)与框架控制点(16)的排布"""
import sys
import time
import math

import ezdxf


def main(src_path):
    t0 = time.time()
    doc = ezdxf.readfile(src_path)
    print(f"加载耗时: {time.time()-t0:.1f}s")

    for handle in ("B812D6", "B9F1EA"):
        ent = doc.entitydb.get(handle)
        vs = list(ent.vertices)
        print(f"\n=== {handle} (layer={ent.dxf.layer}, flags={ent.dxf.get('flags',0)}, "
              f"closed={ent.is_closed}) 共 {len(vs)} 顶点 ===")
        for i, v in enumerate(vs):
            f = v.dxf.get("flags", 0)
            loc = v.dxf.location
            print(f"  [{i:2d}] flag={f:2d} ({loc.x:12.6f},{loc.y:12.6f},{loc.z:8.3f})")

        # flag=8 顶点序列是否闭合?
        sp = [v.dxf.location for v in vs if v.dxf.get("flags", 0) & 8]
        cp = [v.dxf.location for v in vs if v.dxf.get("flags", 0) & 16]
        print(f"  flag=8 样条顶点: {len(sp)}, 首尾距离: "
              f"{(sp[0]-sp[-1]).magnitude:.4f}")
        print(f"  flag=16 控制点: {len(cp)}")
        # 存储顺序: flag8 与 flag16 的索引序列
        seq = "".join("8" if v.dxf.get("flags", 0) & 8 else "C" for v in vs)
        print(f"  顶点类型序列: {seq}")


if __name__ == "__main__":
    main(sys.argv[1])
