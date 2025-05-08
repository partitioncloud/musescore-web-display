"""
Export a MuseScore file to needed .wd/* files
"""
from typing import List, Tuple
import subprocess
import tempfile
import shutil
import json
import sys
import os
import re


MSCORE="mscore"
if "MSCORE" in os.environ:
    MSCORE = os.environ["MSCORE"]


def mscore(*args) -> str:
    """Wrapper to issue MuseScore commands"""
    return subprocess.check_output(
        [MSCORE]+list(map(str, args)),
        stderr=subprocess.DEVNULL
    ).decode("utf-8")

def get_mscore_version() -> Tuple[int, int, int]:
    """Get MuseScore version (to differentiate between v3 and v4)"""
    p = re.compile(r"MuseScore(3|4) \1\.([0-9]*)\.([0-9]*)")
    regex_result = p.search(mscore("--version"))

    if regex_result is None:
        raise EnvironmentError("MuseScore not found or unknown version")
    return (
        int(regex_result.group(1)),
        int(regex_result.group(2)),
        int(regex_result.group(3))
    )


def generate_metadata(source_file, dest) -> None:
    """
    Generate score metadata, measures and segments positions
    """
    mscore_version = get_mscore_version()

    meta_dest = os.path.join(dest, "meta.metajson")
    if mscore_version[0] == 3:
        mscore("--export-to", meta_dest, source_file)
    else:
        with open(meta_dest, 'w', encoding="utf8") as f:
            f.write(mscore("--score-meta", source_file))

    mscore("--export-to", os.path.join(dest, "measures.mpos"), source_file)
    mscore("--export-to", os.path.join(dest, "segments.spos"), source_file)


def generate_svg_graphics(source_file, dest) -> List[str]:
    """
    Generate svg from score
    """
    mscore("--export-to", os.path.join(dest, "graphic.svg"), source_file)


    regex = re.compile(r"graphic-[0-9]*\.svg")
    return [file for file in os.listdir(dest) if regex.match(file)]


def generate_audio(source_file, dest) -> List[str]:
    """
    Generate audio from score
    """
    with tempfile.NamedTemporaryFile('w', delete_on_close=False, suffix=".json") as fp:
        json.dump([
            {
                "in": source_file,
                "out": [
                    os.path.join(dest, "audio.ogg"),
                    [os.path.join(dest, "audio-"), ".ogg"]
                ]
            }
        ], fp)
        fp.close()

        mscore("--job", fp.name)

    regex = re.compile(r"audio(-.*|)\.ogg")
    return [file for file in os.listdir(dest) if regex.match(file)]



def export_wd(source_file, output, verbose=False):
    """
    Create all the needed files
    """
    log = print if verbose else lambda *_1, **_2: None

    if os.path.isdir(source_file) or not os.path.exists(source_file):
        raise FileNotFoundError(f"Cannot find file {source_file}")

    if os.path.isfile(output):
        raise ValueError(f"{output} is an existing file")

    os.makedirs(output, exist_ok=True)

    log("- Generating metadata")
    generate_metadata(source_file, output)

    log("- Generating SVG graphics")
    generate_svg_graphics(source_file, output)

    log("- Generating OGG audio")
    generate_audio(source_file, output)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            f"Usage: {sys.argv[0]} <score-file> [output:defaults to data/score-file.wd]",
            file=sys.stderr
        )
        sys.exit(1)

    filename = sys.argv[1]
    output_dir = "data/"+filename + ".wd/"
    if len(sys.argv) > 2:
        output_dir = sys.argv[2]

    if not filename[-5:].endswith(".mscz"):
        print("Score file must have .mscz extension.", file=sys.stderr)
        sys.exit(1)

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

    export_wd(sys.argv[1], output_dir, verbose=True)
