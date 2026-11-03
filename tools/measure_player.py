"""测量极简播放页截图的版式锚点，用来和参考图逐项对比。

只用像素事实，不读代码常量：封面框靠"局部标准差最大的连续块"定位，
文字行靠"与行内背景的对比度"定位。

用法：
    python tools/measure_player.py 参考图.png 我的图.png
"""
import sys

import numpy as np
from PIL import Image


def std_map(gray: np.ndarray, k: int = 35) -> np.ndarray:
    h, w = gray.shape
    p = np.pad(gray, k, mode="edge")
    ii = np.zeros((p.shape[0] + 1, p.shape[1] + 1))
    ii[1:, 1:] = p.cumsum(0).cumsum(1)
    q = np.pad(gray * gray, k, mode="edge")
    jj = np.zeros((q.shape[0] + 1, q.shape[1] + 1))
    jj[1:, 1:] = q.cumsum(0).cumsum(1)
    y0 = np.arange(h)[:, None] + k
    x0 = np.arange(w)[None, :] + k
    n = k * k

    def window(cum):
        return (cum[y0 + k, x0 + k] - cum[y0, x0 + k] - cum[y0 + k, x0] + cum[y0, x0])

    s, s2 = window(ii), window(jj)
    return np.sqrt(np.maximum(s2 / n - (s / n) ** 2, 0))


def sleeve(gray: np.ndarray):
    """返回 (x0, x1, y0, y1) 像素坐标。"""
    h, w = gray.shape
    m = std_map(gray) > 7
    middle = m[:, int(w * 0.2):int(w * 0.8)]
    rows = middle.mean(axis=1) > 0.5
    runs, start = [], None
    for y in range(h):
        if rows[y] and start is None:
            start = y
        elif not rows[y] and start is not None:
            runs.append((start, y - 1))
            start = None
    if start is not None:
        runs.append((start, h - 1))
    runs = [r for r in runs if r[1] - r[0] > 200]
    if not runs:
        return None
    y0, y1 = max(runs, key=lambda r: r[1] - r[0])
    band = m[y0:y1 + 1]
    cols = band.mean(axis=0) > 0.5
    xs = np.where(cols)[0]
    return int(xs.min()), int(xs.max()), y0, y1


def text_rows(gray: np.ndarray, y0: float, y1: float):
    """在 [y0, y1) 比例区间里找"内容行"，返回相对整图的高度百分比。"""
    h, w = gray.shape
    top, bottom = int(h * y0), int(h * y1)
    band = gray[top:bottom]
    bg = np.median(band, axis=1, keepdims=True)
    density = (np.abs(band - bg) > 26)[:, int(w * 0.03):int(w * 0.92)].mean(axis=1)
    on = density > 0.02
    out, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - 1 - start >= 4:
                out.append(((top + start) / h * 100, (top + i - 1) / h * 100))
            start = None
    if start is not None and bottom - 1 - start >= 4:
        out.append(((top + start) / h * 100, (bottom - 1) / h * 100))
    return out


def report(path: str):
    im = Image.open(path).convert("RGB")
    gray = np.asarray(im).astype(np.float64).mean(axis=2)
    h, w = gray.shape
    s = sleeve(gray)
    print(f"\n=== {path}  ({w}x{h})")
    if s:
        x0, x1, y0, y1 = s
        print(f"  封面  x {x0}..{x1}  = {x0/w*100:5.1f}%..{x1/w*100:5.1f}%   宽 {(x1-x0)/w*100:5.1f}%")
        print(f"        y {y0}..{y1}  = {y0/h*100:5.1f}%..{y1/h*100:5.1f}%   高 {(y1-y0)/h*100:5.1f}%")
    else:
        print("  封面  未找到")
        y0 = 0
    for a, b in text_rows(gray, (y0 + (s[3] - s[2] if s else 0)) / h if s else 0.5, 1.0):
        print(f"  行    {a:5.1f}% .. {b:5.1f}%   (高 {b-a:4.1f}%)")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        report(p)
