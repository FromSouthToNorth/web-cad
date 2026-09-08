# CAD DXF 图纸处理

基于本地已安装的 [ezdxf](https://ezdxf.readthedocs.io/)（1.4+）对 `cad/dxf/` 图纸进行批量预处理：
清洗、打散、标准化，减小文件体积并把复杂实体化简为基础图元，便于 Web 端查看器解析与渲染。

- 各阶段实现细节、性能优化要点与故障排查见 [process_dxf.md](./process_dxf.md)

## 快速使用

```bash
pip install ezdxf

# 处理 cad/dxf/ 下所有 DXF，输出到 cad/dxf/processed/
python cad-tools/process_dxf.py

# 指定输入输出目录 / 只处理部分文件 / 限制文件大小 / 跳过已处理文件
python cad-tools/process_dxf.py --src cad/dxf --out cad/dxf/processed \
    --only 千树塔 --max-size 100000 --skip-processed
```

> `cad/dxf/` 图纸目录未随仓库提交，需自行准备（或用 `--src` 指向已有图纸目录）。

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--src` | `cad/dxf` | 源 DXF 目录 |
| `--out` | `cad/dxf/processed` | 输出目录（文件名与源文件相同） |
| `--only` | 无 | 只处理文件名包含该字符串的图纸 |
| `--max-size` | 无 | 只处理小于指定大小 (KB) 的文件 |
| `--skip-processed` | 关 | 跳过输出目录中已存在同名文件的图纸 |

- 读取失败时自动回退 `recover` 容错模式，轻微损坏的文件也能处理
- 处理日志写入 [`logs/`](./logs/)：每文件统计 `process_*.log`，整批汇总 `summary_*.log`

## 处理内容

各阶段按固定顺序执行（每阶段打印耗时与模型空间实体数），详见 [process_dxf.md](./process_dxf.md) 第 2 节。

### 图层处理
- 删除关闭 (OFF)、冻结 (FROZEN)、锁定 (LOCKED) 图层上的实体及图层本身（块定义内部同样清理，块打散后再清一遍）
- 清洗删除相同属性/坐标的重复实体 (OVERKILL)
- 清理无实体的空图层（保留 0 / Defpoints）
- 清理无用对象，减少文件大小：PURGE 不再被引用的块定义并物理回收实体数据库
- 删除外部无法引用的参照块（参照文件缺失时，连同其 INSERT 一并删除）

### 文本处理
- 多行文本 (MTEXT) 转单行文本 (TEXT)
  - 剥离格式化控制码，\S 堆叠码转为 Unicode 上/下标
  - 数字保持为单行文本，不会炸开为多个文本（仅超出文本框宽度时按宽度换行）
- 靠左对齐，将居中的文本全部设置为靠左对齐 (JUSTIFYTEXT)：按原对齐方式反算基线左端点，渲染位置保持不变

### 打散
- 填充 (HATCH) 打散为边界直线段（曲线按 0.05 弦高离散）
- 表格 (ACAD_TABLE) 打散
- 块 (INSERT) 递归打散（最多 32 层）
- 外部参照 (XREF) 绑定后随块打散展开

### 文字处理
- 字体统一为宋体 (simsun.ttf)
- CAD 字体高度根据宽度因子处理（样式级与实体级均折算）
  - 高度 = 原高度 × 宽度因子 = 35 × 0.8 = 28
  - 宽度因子 = 1

### 线段处理
- 多段线 (LWPOLYLINE/POLYLINE) 打断为直线段；样条拟合多段线只取样条顶点 (flag&8)，剔除框架控制点
- 删除长度为 0.1 的直线段，在多段线打断为直线段之后执行
- 线段厚度设置为 0
  - 直线厚度设置为 0
  - 圆弧的厚度设置为 0

## 目录结构

```
cad-tools/
├── process_dxf.py     # DXF 批量预处理主脚本
├── process_dxf.md     # 脚本详细文档（阶段逻辑、性能要点、故障排查）
├── tools/             # 排查/验证用一次性脚本（probe_*/verify_*/split 等）
└── logs/              # 处理日志（process_*.log 每文件 / summary_*.log 汇总）
```

## 相关文档

- [process_dxf.md](./process_dxf.md)：各阶段实现细节、性能优化要点、故障排查
- [../docs/03-缺陷修复与功能改造/样条拟合多段线打散重叠直线修复总结.md](../docs/03-缺陷修复与功能改造/样条拟合多段线打散重叠直线修复总结.md)：样条拟合多段线打断重叠修复
