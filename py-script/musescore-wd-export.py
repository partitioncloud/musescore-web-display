import os
import shutil
import sys
import subprocess
import json
import re

MSCORE="mscore"
if "MSCORE" in os.environ:
	MSCORE = os.environ["MSCORE"]

def mscore(*args):
    return subprocess.check_output(
		[MSCORE]+list(map(str, args)),
		stderr=subprocess.STDOUT
	).decode("utf-8")

def get_mscore_version():
	p = re.compile(r"MuseScore(3|4) \1\.([0-9]*)\.([0-9]*)")
	regex_result = p.search(mscore("--version"))
	return (
		int(regex_result.group(1)),
		int(regex_result.group(2)),
		int(regex_result.group(3))
	)


if(len(sys.argv) < 2):
	print('Usage: musescore-wd-export <score-file>')
	exit(3)

filename = sys.argv[1]

if (filename[-5:] != '.mscz'):
	print('Score file must have .mscz extension.')
	exit(4)
	
if (os.path.isdir(filename) or not os.path.exists(filename)):
	print('Cannot find file ' + filename)
	exit(5)

dst_dir_name = filename + '.wd/'

if os.path.exists(dst_dir_name):
    if os.path.isfile(dst_dir_name):
        exit(1)
    shutil.rmtree(dst_dir_name)

os.makedirs(dst_dir_name, exist_ok=True)

mscore_version = get_mscore_version()

print("- Generating metadata")
if mscore_version[0] == 3:
	mscore('--export-to', dst_dir_name + 'meta.metajson', filename)
else:
	with open(os.path.join(dst_dir_name, "meta.metajson"), 'w', encoding="utf8") as f:
		f.write(mscore('--score-meta', filename))

print("- Generating SVG graphics")
mscore('--export-to', dst_dir_name + 'graphic.svg', filename)

print("- Generating OGG audio")
with open(os.path.join(dst_dir_name, 'audio-jobs.json'), 'w') as f:
	json.dump([
		{
			'in': filename,
			'out': [
				dst_dir_name + 'audio.ogg',
				[ dst_dir_name + 'audio-', '.ogg' ]
			]
		}
	], f)
mscore('--job', dst_dir_name + 'audio-jobs.json')
os.unlink(dst_dir_name + 'audio-jobs.json')

print("- Generating measure positions")
mscore('--export-to', dst_dir_name + 'measures.mpos', filename)

print("- Generating segment positions")
mscore('--export-to', dst_dir_name + 'segments.spos', filename)
