"""Adds the background ambience (audio/bed.mp3) to already recorded videos, without re-recording or re-voicing.

    python videos/tools/add_bed.py videos/output/login/teacher-ky.mp4 [more.mp4 …] [--out-dir DIR] [--bed other.mp3]

Picture and subtitles are copied as they are; only the audio track is re-mixed (voice + ducked bed).
Without --out-dir the file is replaced in place. A video re-recorded by make_video.py already has the bed.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from make_video import BED, bed_filter, duration, ffmpeg_bins


def add_bed(ffmpeg: str, ffprobe: str, src: Path, dst: Path, bed: Path) -> None:
    length = duration(ffprobe, src)
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / src.name
        graph = [f"[0:a]apad,atrim=0:{length:.2f}[voice]", *bed_filter("voice", 1, length, "aout")]
        subprocess.run([
            ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-stream_loop", "-1", "-i", str(bed),
            "-filter_complex", ";".join(graph),
            "-map", "0:v", "-map", "[aout]", "-map", "0:s?", "-map_metadata", "0",
            # -t: a looped bed is endless; bound the output by the picture so ffmpeg always finishes.
            "-t", f"{length:.2f}",
            "-c:v", "copy", "-c:s", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out),
        ], check=True)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(out, dst)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+", type=Path)
    ap.add_argument("--out-dir", type=Path, help="write here instead of replacing the files")
    ap.add_argument("--bed", type=Path, default=BED)
    args = ap.parse_args()
    if not args.bed.exists():
        sys.exit(f"no bed file: {args.bed}")
    ffmpeg, ffprobe = ffmpeg_bins()
    for src in args.videos:
        dst = args.out_dir / src.name if args.out_dir else src
        add_bed(ffmpeg, ffprobe, src, dst, args.bed)
        print("ok", dst)


if __name__ == "__main__":
    main()
