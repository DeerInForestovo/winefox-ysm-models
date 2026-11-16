#!/usr/bin/env python3
"""Use an externally supplied official YSM 2.6.5 JAR; do not launch Minecraft or redistribute JARs."""
import argparse
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--java', default='java')
parser.add_argument('--ysm-jar', type=Path, required=True)
parser.add_argument('--libraries', type=Path, required=True, help='Existing NeoForge installation libraries')
parser.add_argument('--script', type=Path, default=ROOT/'工程师酒狐/functions/winefox_bc_update@player_update.molang')
args = parser.parse_args()
classpath = [args.ysm_jar.resolve(), *sorted(args.libraries.resolve().rglob('*.jar'))]
subprocess.run([args.java, '-cp', os.pathsep.join(map(str, classpath)),
                str(ROOT/'tools/YsmMolangRegression.java'), str(args.script.resolve())], check=True)
