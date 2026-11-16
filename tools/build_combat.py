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


def pose_variables(data):
    # Claim every upper-body rotation/position used by any of the three clips,
    # so a thrust-only offset also fades out when the next slash takes over.
    return sorted({(bone, channel) for clip in data['animations'].values()
                   for bone, channels in clip['bones'].items()
                   for channel in channels if channel in ('rotation', 'position')})


def compile_clips():
    data = json.loads((ROOT/'authoring/better_combat.keyframes.json').read_text())
    variables = pose_variables(data)
    for clip in data['animations'].values():
        clip.pop('anim_time_update', None)
        clip['loop'] = True
        for bone, channel in variables:
            clip['bones'].setdefault(bone, {}).setdefault(channel, [0, 0, 0])
        for bone, channels in clip['bones'].items():
            for channel, frames in channels.items():
                values = [curve(frames, axis) for axis in range(3)]
                if channel in ('rotation', 'position'):
                    for axis, value in enumerate(values):
                        key = f'{bone}_{channel}_{axis}'.lower()
                        # Save displayed local pose for a subsequent combo, not the
                        # authored idle or the unblended target of this frame.
                        values[axis] = (f'v.winefox_bc_pose_{key} = v.winefox_bc_from_{key} + '
                                        f'(({value}) - v.winefox_bc_from_{key}) * v.winefox_bc_blend; '
                                        f'return v.winefox_bc_pose_{key};')
                channels[channel] = values
    return json.dumps(data, ensure_ascii=False, indent='\t') + '\n'


def compile_snapshot():
    data = json.loads((ROOT/'authoring/better_combat.keyframes.json').read_text())
    path = ROOT/'工程师酒狐/functions/winefox_bc_update@player_update.molang'
    text = path.read_text()
    begin = '    // BEGIN GENERATED POSE SNAPSHOT\n'
    end = '    // END GENERATED POSE SNAPSHOT'
    lines = ['    v.winefox_bc_combo ? {']
    for bone, channel in pose_variables(data):
        for axis in range(3):
            key = f'{bone}_{channel}_{axis}'.lower()
            lines.append(f'        v.winefox_bc_from_{key} = v.winefox_bc_pose_{key};')
    lines.append('    };')
    a = text.index(begin) + len(begin)
    b = text.index(end, a)
    return text[:a] + '\n'.join(lines) + '\n' + text[b:]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = {
        ROOT/'工程师酒狐/animations/better_combat.animation.json': compile_clips(),
        ROOT/'工程师酒狐/functions/winefox_bc_update@player_update.molang': compile_snapshot(),
    }
    for target, output in outputs.items():
        if args.check:
            if target.read_text() != output:
                raise SystemExit('Generated resources differ; run tools/build_combat.py')
        else:
            target.write_text(output)
    if args.check:
        print('PASS: runtime curves and pose snapshots match authoring keyframes')
