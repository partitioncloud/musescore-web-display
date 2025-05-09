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

import music21


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


def generate_separated_midi(source_file, output_folder):
    """
    From MuseScore v4, a batch job does not generate parts files, this is a workaround
    see https://github.com/musescore/MuseScore/issues/27383
    """
    def get_elements(stream, classe):
        elements = []
        for el in stream[classe]:
            offset = el.activeSite.getOffsetBySite(stream.parts[0]) + el.getOffsetBySite(el.activeSite)
            elements.append((offset, el))
        return elements


    def add_elements(stream, elements):
        st_elements = [(offset, el.number) for (offset, el) in get_elements(stream, 'MetronomeMark')]
        #print(st_elements)
        for offset, el in elements:
            if (offset, el.number) not in st_elements:
                stream.insert(offset, el)
                #print(f"Inserting {el}@{offset}")

        return stream

    # Generate midi file
    mscore(source_file, "-o", os.path.join(output_folder, "score.mid"))

    # Load MIDI file
    stream = music21.converter.parse(
        os.path.join(output_folder, "score.mid")
    )
    outputs = []

    elements = get_elements(stream, 'MetronomeMark')
    # TODO : modify instruments for piano
    # TODO : why is volume so bad ?
    # Extract each part (music21.instrument) and create a separate MIDI file for each
    for i, part in enumerate(stream.parts):
        part.makeRests(fillGaps=True, inPlace=True)
        part.makeMeasures(inPlace=True)
        part.makeTies(inPlace=True)

        # Create a new music21.stream for each part
        instrument_stream = music21.stream.Score()
        instrument_stream.append(part)

        instrument_stream = add_elements(instrument_stream, elements)

        # Create a new MIDI file for each music21.instrument
        output_path = f"{output_folder}/instrument_{i + 1}.mid"
        instrument_stream.write('midi', fp=output_path)
        outputs.append(output_path)
    return outputs


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
    mscore_version = get_mscore_version()

    if mscore_version[0] == 3:
        job_config = [{
            "in": source_file,
            "out": [
                os.path.join(dest, "audio.ogg"),
                [os.path.join(dest, "audio-"), ".ogg"]
            ]
        }]
    else:
        tmp_dir = tempfile.TemporaryDirectory()
        job_config = [{
            "in": source_file,
            "out": [os.path.join(dest, "audio.ogg")]
        }] + [{
            "in": file,
            "out": [os.path.join(dest, os.path.basename(file)+".ogg")]
        } for file in generate_separated_midi(source_file, tmp_dir.name)]

    with tempfile.NamedTemporaryFile('w', delete_on_close=False, suffix=".json") as fp:
        json.dump(job_config, fp)
        fp.close()

        mscore("--job", fp.name)

    if mscore_version[0] == 4:
        tmp_dir.cleanup()

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
    output_dir = os.path.join("data", os.path.basename(filename)+".wd/")
    if len(sys.argv) > 2:
        output_dir = sys.argv[2]

    if not filename[-5:].endswith(".mscz"):
        print("Score file must have .mscz extension.", file=sys.stderr)
        sys.exit(1)

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

    export_wd(sys.argv[1], output_dir, verbose=True)
