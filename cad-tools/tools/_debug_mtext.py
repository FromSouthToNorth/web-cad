# -*- coding: utf-8 -*-
"""Debug MTEXT parsing"""
import sys, re
sys.path.insert(0, '..')
from process_dxf import strip_mtext_formatting, _MTEXT_CODE, _MTEXT_STACK

text = r'{\C1;A}{\C0;B}{\C1;C}'
print(f"Input: {text!r}")

# Step through the first loop manually
result = []
depth = 0
prev_was_close = False
i = 0
n = len(text)

while i < n:
    ch = text[i]

    if ch == '\\':
        if prev_was_close and depth == 0:
            result.append('\\P')
            prev_was_close = False
        j = i + 1
        while j < n and text[j] != ';':
            if text[j] in ('{', '}'):
                break
            j += 1
        if j < n and text[j] == ';':
            code = text[i:j+1]
            result.append(code)
            i = j + 1
        else:
            result.append(ch)
            i += 1
        continue

    if ch == '{':
        print(f"  i={i} '{{' depth={depth} prev_close={prev_was_close}")
        if depth == 0 and prev_was_close:
            result.append('\\P')
            prev_was_close = False
            print(f"    -> inserted \\P")
        depth += 1
        result.append(ch)
        i += 1
        continue

    if ch == '}':
        depth = max(0, depth - 1)
        if depth == 0:
            prev_was_close = True
        print(f"  i={i} '}}' depth={depth} prev_close={prev_was_close}")
        result.append(ch)
        i += 1
        continue

    if prev_was_close and depth == 0 and ch not in (' ', '\t'):
        result.append('\\P')
        prev_was_close = False

    result.append(ch)
    i += 1

joined = ''.join(result)
print(f"\nAfter loop: {joined!r}")

# Now apply regex strip
def _strip_code(m):
    code = m.group(1)
    if code == 'P':
        return '\\P'
    if code == '~':
        return ' '
    return ''

joined2 = _MTEXT_CODE.sub(_strip_code, joined)
print(f"After regex strip: {joined2!r}")

joined3 = joined2.replace('{', '').replace('}', '')
print(f"After removing braces: {joined3!r}")

# Now compare with the actual function
print(f"\nActual function output: {strip_mtext_formatting(text)!r}")
