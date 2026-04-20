// You will need to serve Webmscore, that you can get:
// From https://github.com/LibreScore/webmscore:
// - supports MuseScore v4.0 files, see PR#15.
// - Served at https://cdn.jsdelivr.net/npm/webmscore/webmscore.mjs
// From https://github.com/CarlGao4/webmscore:
// - supports MuseScore v4.3.2, see PR#1
// From https://github.com/augustin64/MuseScore:
// - supports MuseScore v4.6.5
const LIB_WEBMSCORE = "../webmscore/webmscore.mjs";
// LIB_WEBMSCORE_VERSION is defined by rolldown in the Makefile
export const LIB_WEBMSCORE_MAJOR = (
  (ver) => ver.substr("", ver.lastIndexOf("."))
)(LIB_WEBMSCORE_VERSION);

// From https://musescore.org/en/handbook/3/file-formats#share-with-other-software
export const WebMscoreSupported = [
  'gp', 'gpx', 'gp5', 'gp4', 'gp3',
  'musicxml', 'xml', 'mxl',
  'mid', 'midi', 'kar',
  'mscz', 'mscx',
  'cap', 'capx',
  'mgu', 'sgu',
  'ove', 'scw',
  'mei',
  'ptb',
  'bww',
  "md",
];


let WebMscore;
async function ensure_webmscore() {
  if (WebMscore !== undefined) {
    return await WebMscore.ready;
  };

  const module = await import(LIB_WEBMSCORE);
  WebMscore = module.default;

  await WebMscore.ready;
}


// Load data from a MuseScore supported file, with webmscore
export class WebMscoreLoader {
  constructor (src, type) {
    this.src = src;
    this.type = type;

    this.score = this.load_score();
  }

  async load_score() {
    await ensure_webmscore();

    return fetch(this.src)
    .then((data) => data.arrayBuffer())
    .then((filedata) =>
      WebMscore.load(this.type, new Uint8Array(filedata))
    )
  }

  async loadMetaData() {
    let score = await this.score;
    return await score.metadata()
  }

  /** Load measures positions, set savePositions=true to load each note event position */
  async loadPos(savePositions) {
    let score = await this.score;
    let posRaw = await score.savePositions(savePositions);

    let json_data = JSON.parse(posRaw);

    const minWidth = 64;
    let element_transform = ((el, index, elements) => {
      let width = el.sx;

      // If sx is 0, try to recover from the next element
      if (width === 0 && elements && index < elements.length - 1) {
        const next = elements[index + 1];
        if (next && next.x > el.x && next.y == el.y) {
          width = next.x - el.x;
        }
      }

      return {
        elid: el.id,
        pos: [el.x, el.y],
        size: [Math.max(width, minWidth), el.sy],
        page: +el.page
      }
    });

    let event_transform = (evt) => ({
      elid: evt.elid,
      time: evt.position / 1000
    })

    const events = [];
    json_data.events.forEach((e) => {
      events[e.elid] = event_transform(e);
    });
    return {
      elements: json_data.elements.map(element_transform),
      events: events
    }
  }

  async loadGraphics(count) {
    let score = await this.score;

    let graphics = Array(count).fill(null);

    for (let i = 0; i < graphics.length; i++) {
      graphics[i] = await score.saveSvg(i, false);
    }

    return graphics;
  }

  async setSoundFont() {
    let score = await this.score;

    const soundFontData = new Uint8Array(
      await (
        await fetch('https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3')
        // TODO: get soundfont URL from options, compare this one with Magenta default one for default
      ).arrayBuffer()
    )
    await score.setSoundFont(soundFontData);
  }

  async synthAudio(start_time) {
    let score = await this.score;
    await this.setSoundFont();

    return await score.synthAudio(start_time);
  }

  async exportAs(format) {
    let score = await this.score;

    if (format == "mscz")
      return score.saveMsc("mscz");
    if (format == "musicxml")
      return score.saveXml();
    if (format == "pdf")
      return score.savePdf();
    if (format == "mxl")
      return score.saveMxl();
    if (format == "mid")
      return score.saveMidi();
    if (format == "ogg")
      return score.saveAudio("ogg");

    console.error(`Unknown download format ${format}`);
  }

  async destroy() {
    let score = await this.score;
    score.destroy(false);
  }
}