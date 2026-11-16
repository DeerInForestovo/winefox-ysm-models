#!/usr/bin/env python3
"""Compile editable normalized keyframes into YSM-compatible phase-driven curves.

YSM 2.6.5 ignores Bedrock anim_time_update. A player_update function owns the
shared clock, so every bone evaluates the same phase, including repeated attacks.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def vector(frame):
    if isinstance(frame, dict):
        frame = frame['post']
    return frame if isinstance(frame, list) else [frame] * 3


def number(value):
    # Molang does not accept JSON/Python scientific notation in expressions.
    return format(value, ".10f").rstrip("0").rstrip(".") or "0"


def curve(frames, axis):
    if not isinstance(frames, dict):
        return vector(frames)[axis]
    keys = sorted(frames, key=float)
    points = [(float(t), vector(frames[t])[axis]) for t in keys]
    expression = number(points[-1][1])
    for i in reversed(range(len(points) - 1)):
        a, start = points[i]
        b, end = points[i + 1]
        # Blockbench selects Catmull-Rom when either endpoint requests it.
        cubic = any(isinstance(frames[k], dict) and
                    frames[k].get('lerp_mode') == 'catmullrom'
                    for k in keys[i:i + 2])
        left = points[max(0, i - 1)][1]
        right = points[min(len(points) - 1, i + 2)][1]
        if start == end and (not cubic or left == start == right):
            segment = number(start)
        else:
            args = [a, b, start, end, 0 if cubic else 1]
            if cubic:
                args += [left, right]
            segment = 'fn.winefox_bc_lerp(v.winefox_bc_phase, ' + ', '.join(map(number, args)) + ')'
        expression = f'v.winefox_bc_phase < {number(b)} ? ({segment}) : ({expression})'
    return expression


def compile_clips():
    data = json.loads((ROOT/'authoring/better_combat.keyframes.json').read_text())
    for clip in data['animations'].values():
        clip.pop('anim_time_update', None)
        clip['loop'] = True
        for channels in clip['bones'].values():
            for channel, frames in channels.items():
                channels[channel] = [curve(frames, axis) for axis in range(3)]
    return json.dumps(data, ensure_ascii=False, indent='\t') + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = ROOT/'工程师酒狐/animations/better_combat.animation.json'
    output = compile_clips()
    if args.check:
        if target.read_text() != output:
            raise SystemExit('Runtime curves differ from authoring keyframes; run tools/build_combat.py')
        print('PASS: runtime curves match authoring keyframes')
    else:
        target.write_text(output)
