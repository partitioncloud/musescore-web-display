# MuseScore Web Display

> **This is not an officially supported/endorsed [MuseScore](https://musescore.org/) product.**

![screenshot](screenshot.png)

> Original work from [yezhiyi9670](https://github.com/yezhiyi9670)

This is a simple and elegant library allowing you to create an interactive showcase of your score, similar to the score showcase seen on musescore.com. [See a working demo here](https://partitioncloud.github.io/musescore-web-display/).

This library uses [Vue](https://vuejs.org/), [Howler](https://github.com/goldfire/howler.js), the [Line Awesome icon font](https://icons8.com/line-awesome) and [webmscore](https://github.com/partitioncloud/webmscore).

## Features

- (kind of) mobile friendly.
- Render score pages horizontally, like the way they are in the MuseScore editor.
- Zoom: give a closer look to the score.
- Audio playback, with a cursor highlighting the current measure (auto-scroll included).
- Keyboard shortcuts.
- Add as many tracks as needed, midi, audio and mscz-generated [are supported](#integrating-into-existing-html)

## Running

This library is bundled with `rolldown`. You can find bundled code in the [releases tab](https://github.com/partitioncloud/musescore-web-display/releases). You will also need to serve webmscore, that you can download [there](https://github.com/augustin64/MuseScore/releases).  
If you absolutely need a buildless library, the build step was only added in v2.0.0.

## Building

```bash
git clone https://github.com/partitioncloud/musescore-web-display
cd musescore-web-display

make target # This will download webmscore and bundle the main JS file to target/score-display.rolldown.js
```

You can build a bundle without MIDI tracks support, which will be ~10 times smaller with `make target/score-display.rolldown.no-mm.js`.
The `<score-display...>no-cdn.js` versions never request a CDN: they will require you to serve `line-awesome`, an audio font and `pdfjs` (if you plan to load PDFs) along with webmscore, the css and js files.

## Usage

### The Component

The main library is `score-display/score-display.global.js`, which exposes a new HTML component: `<score-display>`.

You have three options to embed a score:
1. export all files using the [python script](./py-script/wd_export.py), and serve these files directly to the client
2. serve directly the MuseScore (mscz) file, that will be processed in the client's browser.  
   This will be a bit heavier for the client (~20MB), [exclude very old browsers](https://github.com/partitioncloud/webmscore?tab=readme-ov-file#browser-support), [may need a bit of setup to get all fonts working](https://github.com/partitioncloud/webmscore?tab=readme-ov-file#load-extra-fonts) on some scores, but will simplify your backend
3. serve directly a PDF file, that will be rendered in the client's browser (no measure highlighting during playback in that case)

#### Serving from exported directory

Your component will look like that:
```html
<score-display src="/your/score/data/path.mscz.wd" type="wd-data">
  <!-- Continue reading this file to see how to add audio & download buttons -->
</score-display>
```


The directory that `src` points to should contain the following files [(example here)](./data/Proud%20Of%20You.mscz.wd/):

```plain
Score Directory
├─ meta.metajson     Score metadata
├─ graphic-1.svg     SVG graphic of score pages, one for each page.
├─ graphic-....svg
├─ graphic-8.svg
└─ measures.mpos     Measure positions, for highlighting the current measure during playback.
```

They can all be exported from MuseScore using the [command line interface](https://musescore.org/en/handbook/3/command-line-options).

See also [the python scripts](./py-script/) that automatically exports all files. The scripts exports the audio for ALL part scores in the form of `audio-%s.ogg` by default.

#### Serving from MuseScore file without exporting

Your component will look like that:
```html
<score-display src="/your/score/data/path.mscz" type="mscz">
  <!-- Continue reading this file to see how to add audio & download buttons -->
</score-display>
```

Unfortunately, this requires an up-to-date version of webmscore, and recent versions of MuseScore aren't always supported (currently, supports v4.7.5).

#### Serving a PDF file

Your component will look like that:
```html
<score-display src="/your/score/data/path.pdf" type="pdf">
  <!-- Continue reading this file to see how to add audio & download buttons -->
</score-display>
```

The pages are rendered in the client's browser with [pdf.js](https://mozilla.github.io/pdf.js/), loaded when needed: from a CDN, or from your server with the `no-cdn.js` variants (see below).  
There is no way to know where the measures are in a PDF, so the current measure won't be highlighted during playback, and clicking on a measure won't seek in the audio.

#### Mixing several sources

A score can be displayed from several sources, using `<score-view>` elements. The user can then switch between them:
```html
<score-display src="/your/score/data/path.mscz" type="mscz" is-view>
  <score-view src="/your/score/data/path.pdf" type="pdf">Printed</score-view>
  <!-- `type` is the same as for <score-display>, and defaults to pdf -->

  <score-track type="mscz/synth:all">Tutti</score-track>
</score-display>
```

The view that is displayed by default is, in order:
1. the `<score-display>` itself, if it is a view. A `pdf` or `wd-data` source always is, a mscz source only is if it has the `is-view` attribute (or if there are no `<score-view>`s).
2. the first `<score-view>`.

A view is only loaded when it is displayed: a PDF (and pdf.js) is not downloaded until the user switches to it.

Without `is-view`, the mscz is only used for the audio (`mscz/synth`) tracks and the `mscz/export:` downloads, which saves loading the pages of a score you don't display.
Note that those default to the `src` of the `<score-display>`: with a `pdf` source, give the tracks a `src` pointing to your mscz.


### Integrating into existing HTML

Dependencies will be loaded when needed by the script, here is how to integrate it:

1. Add this library.

```html
<link rel="stylesheet" href="<path to library>/score-display.css" />
<script type="module" src="<path to library>/score-display.rolldown.js"></script>
```

In `<path to library>`, you will need to serve:
```
├── score-display.css
├── score-display.rolldown.js   or any of its variants
├── soundfonts                 *if using a no-cdn.js variant
│   └── FluidR3Mono_GM.sf3
├── style                      *if using a no-cdn.js variant
│   └── line-awesome
├── pdfjs                      *if using a no-cdn.js variant, and you plan to load scores with type=pdf
└── webmscore                   if you plan to load scores with type!=wd-data
```
Those are obtainable through `make webmscore target/style/line-awesome target/soundfonts/FluidR3Mono_GM.sf3 target/pdfjs`

Note that MIDI tracks use a default soundfont hosted on a CDN, unless you give them a `sound-font` attribute (or use the `no-mm` variant, that does not support MIDI tracks).

2. A container element for your score showcase (needs to be after the `<script>` tag)

```html
<score-display src="..." type="...">
  <score-track src=".../audio.ogg" type="audio">Piano</score-track><!-- Add audio track -->
  <score-track src=".../audio.mid" type="midi">Piano [mid]</score-track><!-- Add midi track as well! -->

  <!-- Add track from mscz, `src` being optional if the whole score is mscz -->
  <score-track src=".../score.mscz" type="mscz/synth:all">All instruments [from mscz]</score-track>

  <score-download href=".../my score.mscz">Download Mscz</score-download><!-- And download buttons! -->
  <score-download href=".../my score.pdf">Download Pdf</score-download>

  <!-- If score is loaded with webmscore (type=anything else than wd-data), direct exports are possible -->
  <!-- Available formats: mscz (but you'd better provide an URL to your file directly), musicxml, pdf, mxl, mid, ogg -->
  <score-download href="mscz/export:pdf">Export Pdf</score-download>
</score-display>
```
