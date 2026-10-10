#!/usr/bin/env python3
"""Validate and export the curated bundle without rebuilding historical claims.

Use refresh.py to update supported upstream sources. This command keeps manual
reviews and pinned evidence intact. It optionally writes a standalone bundle.
"""
import argparse,json,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,help='New directory for the validated bundle')
    args=parser.parse_args()
    subprocess.run([sys.executable,str(ROOT/'validate.py')],check=True)
    if args.output:
        output=args.output.resolve()
        if output.exists():parser.error('Output directory must not already exist')
        if output.is_relative_to(ROOT):parser.error('Output must be outside the source bundle')
        output.mkdir(parents=True)
        registry=json.loads((ROOT/'registry.json').read_text())
        names=['registry.json','submissions.json','chart-cross-check.json','public-sanitization.json']+[p['data_file'] for p in registry['problems']]
        for name in names:shutil.copyfile(ROOT/name,output/name)
        for name in ['schemas','sources','manifests']:shutil.copytree(ROOT/name,output/name)
        print('Exported validated bundle to',output)
if __name__=='__main__':main()
