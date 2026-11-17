#!/usr/bin/env python3
"""Import approved seconds-based Blockbench axe previews into runtime phase space."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(data, config):
    names = {config['core'], *(entry['clip'] for entry in config['actions'].values())}
    if set(data['animations']) != names:
        raise ValueError('Expected exactly the five approved axe clips')
    anchors = [(0, 0), *[(seconds, config['authoring_phase'][name])
                        for name, seconds in config['authoring_seconds'].items()]]
    if any(b <= a or y <= x for (a, x), (b, y) in zip(anchors, anchors[1:])):
        raise ValueError('Author seconds and runtime phases must increase together')
    def phase(time):
        for (a, x), (b, y) in zip(anchors, anchors[1:]):
            if time <= b + 1e-9:
                return x + (time-a)/(b-a)*(y-x)
        raise ValueError('Keyframe exceeds approved single-clip duration')
    for name, clip in data['animations'].items():
        core = name == config['core']
        length = clip['animation_length']
        if length <= 0 or (not core and length != anchors[-1][0]):
            raise ValueError('Unexpected author clip duration')
        for channels in clip['bones'].values():
            for channel, frames in list(channels.items()):
                if isinstance(frames, dict):
                    converted = {str(round(float(t)/length if core else phase(float(t)), 9)): value
                                 for t, value in frames.items()}
                    if len(converted) != len(frames):
                        raise ValueError('Phase conversion merged distinct keyframes')
                    channels[channel] = converted
        clip['animation_length'] = 1
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path)
    args = parser.parse_args()
    config = json.loads((ROOT/'authoring/better_combat_axe.json').read_text())
    data = normalize(json.loads(args.export.read_text()), config)
    (ROOT/'authoring/better_combat_axe.keyframes.json').write_text(
        json.dumps(data, ensure_ascii=False, indent='\t') + '\n')
