import * as Vue from "https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js";

// Howler: audio library
import "https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js";

const LIB_TONE_JS = "https://cdnjs.cloudflare.com/ajax/libs/tone/15.1.5/Tone.js";
const LIB_MAGENTA_CORE = "https://cdn.jsdelivr.net/npm/@magenta/music@^1.23.1/es6/core.js"

// See https://github.com/LibreScore/webmscore/pull/15 : no support for recent Mscore files
// Download artifacts from https://github.com/CarlGao4/webmscore/actions/runs/14575709935 from now,
// and serve them from /webmscore
// CDN link (with old version) https://cdn.jsdelivr.net/npm/webmscore/webmscore.mjs
const LIB_WEBMSCORE = "/webmscore/webmscore.mjs";

// From https://musescore.org/en/handbook/3/file-formats#share-with-other-software
const WebMscoreSupported = [
  'gp', 'gpx', 'gp5', 'gp4', 'gp3',
  'musicxml', 'xml', 'mxl',
  'mid', 'midi', 'kar',
  'cap', 'capx',
  'mgu', 'sgu',
  'ove', 'scw',
  'mscz',
  'mei',
  'ptb',
  'bww',
  "md",
];


let mm; // Magenta: midi library
/** Returns a promise that fulfills once magenta and Tone.js are loaded */
function ensure_magenta() {
  if (mm !== undefined) return Promise.resolve();

  // Tone.js needs to be synchronously loaded before magenta
  return import(LIB_TONE_JS).then(() =>
    import(LIB_MAGENTA_CORE)).then(() => {
      mm = window.core; // MagentaMusic's core (mm) gets loaded into window.core
      return Promise.resolve();
    });
  }

let WebMscore;
async function ensure_webmscore() {
  if (WebMscore !== undefined) {
    return await WebMscore.ready;
  };

  const module = await import(LIB_WEBMSCORE);
  WebMscore = module.default;

  await WebMscore.ready;
}

/** Simply load a stylesheet */
function loadStylesheet(href) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

loadStylesheet("https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css");


//==============================================

const DEFAULT_SOUNDFONT = "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

/** Wrapper of a MagentaJS player to have the same interface as howler's Howl */
class MidiPlayer {
  /**
   * @param {*} options
   * - `src`, array of a single element: url of the file to load
   * - `onload` callback to execute once the player is ready
   * - `onend` callback to execute once the file is over
   * - Optional `soundfont` url of the soundfont to use
   */
  constructor(options = {}) {
    this.src = options.src.at(0); // We are expecting only one URL, but use this to be coherent with Howler
    this.soundfont = options.soundfont || DEFAULT_SOUNDFONT;

    this.next_seek = null; // Time to seek to the next time the player starts/is resumed
    this.player = null;
    this.data = null;
    this.currentTime = 0;

    ensure_magenta().then(() =>
      this.load_data(options.onload, options.onend)
    );
  }

  load_data(onload, onend) {
    fetch(this.src)
    .then((response) => response.blob())
    .then((blob) => mm.blobToNoteSequence(blob))
    .then((s) => {
      this.seq = s; // Used later in this.play()
      this.player = new mm.SoundFontPlayer(
        this.soundfont,
        undefined,
        undefined,
        undefined,{
          run: (note) => this.currentTime = note.startTime,
          stop: onend
      });
      this.player.loadSamples(this.seq)
      .then(onload);
    });
  }

  playing() {
    return this.player && (this.player.getPlayState() == "started");
  }

  play() {
    let recover_seek = () => {
      if (this.next_seek !== null) {
        this.player.seekTo(this.next_seek);
        this.next_seek = null;
      }
    }

    if (this.player.getPlayState() === 'paused') {
      this.player.resume();
      recover_seek()
    } else {
      this.player.start(this.seq, undefined, this.next_seek ?? 0);
      this.next_seek = null;
    }
  }

  pause() {
    if (!this.playing()) return console.warn("Player already paused");
    this.player.pause();
  }

  duration() { return this.seq.totalTime; }

  seek(time) {
    if (typeof time === 'number') {
      if (! this.playing()) {
        // As we can only seek while playing, we save that in next_seek
        // which is later used by this.play() when resuming
        this.currentTime = time;
        this.next_seek = time;
        return;
      }
      return this.player.seekTo(time);
    }
    return this.currentTime;
  }
}


class WebMscorePlayer {
  /**
   * @param {*} options
   * - `src`, array of a single element: url of the file to load
   * - `onload` callback to execute once the player is ready
   * - `onend` callback to execute once the file is over
   * - `excerpt`: index of the instrument to use (-1 being "all")
   * - Optional `mscz` object (will replace `src`)
   * - Optional `soundfont` url of the soundfont to use
   */
  constructor(options = {}) {
    this.onend = options.onend;
    this.excerpt = options.excerpt;
    this.score_type = options.type;

    this._duration = 0; // To be loaded
    this.next_seek = null; // Time to seek to on the next play() call
    this.is_playing = false;
    this.synth_complete = false; // are all frames synthesized ?
    this.synth_running = false;
    this.stopSynth = async () => {}

    this.CHANNELS = 2
    this.FRAME_LENGTH = 512;
    this.BUFFER_QUEUE = [];

    this.audioCtx = new (AudioContext || webkitAudioContext)();
    this.currentFrame = 0; // ~ currentTime

    this.mscz = options.mscz || new WebMscoreLoader(
      options.src.at(0),
      this.score_type,
      {soundfont: options.soundfont || DEFAULT_SOUNDFONT}
    );
    this.load_data(options.onload);
  }

  async load_data(onload) {
    let score = await this.mscz.score;
    let metadata = await score.metadata();
    await this.mscz.setSoundFont();
    
    await score.generateExcerpts();    
    // TODO: the score may be used to generate graphics etc in the meantime, want to wait for this to be ready
    await score.setExcerptId(this.excerpt);

    this._duration = metadata.duration;

    onload();
  }

  setupProcessor() {
    const processor = this.audioCtx.createScriptProcessor(
      this.FRAME_LENGTH,
      0,
      this.CHANNELS
    );
    this.currentFrame = 0;

    // At each frame, we retrieve a piece of synthesized audio from BUFFER_QUEUE
    processor.onaudioprocess = (e) => {
      if (this.BUFFER_QUEUE.length === 0) {
        // There is nothing left in the queue
        for (let c = 0; c < this.CHANNELS; c++) {
          e.outputBuffer.getChannelData(c).fill(0);
        }
        if (this.synth_complete && this.is_playing) {
          // There is nothing in the queue and everything is already synthesized
          this.onend()
        }
        return;
      }

      const chunk = this.BUFFER_QUEUE.shift();
      for (let c = 0; c < this.CHANNELS; c++) {
        const channel = e.outputBuffer.getChannelData(c);
        channel.set(chunk[c]);
      }
      this.currentFrame += 1;
    };

    processor.connect(this.audioCtx.destination);
    this.processor = processor;
  }


  async synthAudioToQueue(start = 0) {
    let score = await this.mscz.score;
    const fn = await score.synthAudio(start);
    this.stopSynth = (async () => await fn(false));
    this.synth_running = true;

    this.BUFFER_QUEUE = [];
    for (;;) {
      const res = await fn();
      const frames = new Float32Array(res.chunk.buffer);

      // Extract per-channel buffers
      const chunk = {};
      for (let c = 0; c < this.CHANNELS; c++) {
        chunk[c] = frames.subarray(
          c * this.FRAME_LENGTH,
          (c + 1) * this.FRAME_LENGTH
        );
      }
      this.BUFFER_QUEUE.push(chunk);

      if (res.done) {
        this.synth_complete = true
        break;
      }
    }

    this.synth_running = false;
  }


  async play() {
    if (!this.processor) {
      this.setupProcessor();
    }

    if (this.next_seek !== null || ! this.synth_running) {
      // duration might be unknown when seek(.) is called
      await this.mscz.score;
      const start_time = Math.min(this.next_seek, this.duration()) ?? 0;

      this.currentFrame = start_time*this.audioCtx.sampleRate/this.FRAME_LENGTH;
      this.synthAudioToQueue(start_time); // synth in the background

      this.next_seek = null;
    }

    this.is_playing = true;

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
  }

  pause() {
    this.is_playing = false;
    this.audioCtx.suspend();
  }

  playing() {
    return this.is_playing;
  }

  duration() {
    // The last sustain is always a bit longer than the said duration
    return this._duration+2;
  }

  seek(time) {
    // if time is undefined, returns the current seek
    // else, seeks to the specified time
    if (time === undefined) {
      if (!this.is_playing && this.next_seek !== null)
        return this.next_seek;

      return Math.min(this.currentFrame*this.FRAME_LENGTH / this.audioCtx.sampleRate, this.duration());
    }

    // We want to start ON the selected note, so we seek a bit earlier
    time = Math.max(time-0.01, 0);
    (async () => {
      // We clear the current buffer queue
      await this.stopSynth();
      this.stopSynth = async () => {};

      this.synth_complete = false // we don't want onend to be called
      this.BUFFER_QUEUE = [];

      this.next_seek = time;

      if (this.is_playing)
        this.play(); // Re-start synthesizing
    })()
  }
}


// Load data from an .mscz.wd url
class WdDataLoader {

  constructor (src) {
    this.src = src;
  }

  async loadMetaData() {
    const response = await fetch(this.src + '/meta.metajson');
    return await response.json();
  }

  /** Load measures positions, set savePositions=true to load each note event position */
  async loadPos(savePositions) {
    if (savePositions) { console.warn("Attempting to load positions with savePositions=true for a wd-data score")}

    const response = await fetch(this.src + '/measures.mpos');
    const mposXml = new DOMParser().parseFromString(await response.text() ?? '<none />', 'application/xml'); // What happens if not found ?

    const event_items = mposXml.querySelectorAll('event')
    const events = []
    for (let i = 0; i < event_items.length; i++) {
      const item = event_items[i]
      events.push({
        elid: Number(item.getAttribute('elid')),
        time: item.getAttribute('position') / 1000
      })
    }

    const posScale = 12
    const element_items = mposXml.querySelectorAll('element')
    const elements = {}
    for (let i = 0; i < element_items.length; i++) {
      const item = element_items[i]
      const element = {
        elid: item.getAttribute('id'),
        pos: [item.getAttribute('x') / posScale, item.getAttribute('y') / posScale],
        size: [item.getAttribute('sx') / posScale, item.getAttribute('sy') / posScale],
        page: +item.getAttribute('page')
      }
      const minWidth = 64
      if (element.size[0] < minWidth) {
        // element.pos[0] -= (minWidth - element.size[0]) / 2
        element.size[0] = minWidth
      }
      elements[item.getAttribute('id')] = element
    }

    return {
      "events": events,
      "elements": elements
    }
  }

  async _loadPage(pageId) {
    const url = this.src + `/graphic-${pageId+1}.svg`;
    const response = await fetch(url);
    return await response.text();
  }

  async loadGraphics(count) {
    let graphics = Array(count).fill(null);

    for (let i = 0; i < graphics.length; i++) {
      graphics[i] = await this._loadPage(i); // TODO: load only 3 at a time ?
    }

    return graphics;
  }

}

// Load data from a MuseScore supported file, with webmscore
class WebMscoreLoader {
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
    .then((score) => {
      if (this.type == "mscz") return score;

      // Calling "saveSvg, savePositions, ..." directly causes a WorkerError
      return score.saveMsc("mscz")
      .then((msczdata) => WebMscore.load("mscz", msczdata))
    });
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
}


  //==============================================

  function useFrameEffect(func) {
    return Vue.watchEffect((cleanup) => {
      let sustain = true
      function adjust() {
        func()
        if (sustain) {
          requestAnimationFrame(adjust)
        }
      }
      requestAnimationFrame(adjust)
      cleanup(() => {
        sustain = false
      })
    })
  }

  //==============================================

  const Page = {
    emits: ['select'],
    props: {
      id: Number,
      page: [null, Boolean, String],
      pageFormat: Object,
      highlighterElid: [null, Number],
      elementsDict: Object,
    },
    setup(props, ctx) {
      const pageFormat = props.pageFormat
      const ref = Vue.ref(null)

      useFrameEffect(() => {
        if (!ref.value) return
        const newWidth = (ref.value.clientHeight - 2) * pageFormat.width / pageFormat.height + 'px'
        if (ref.value.style.width != newWidth) {
          ref.value.style.width = newWidth
          ref.value.style.fontSize = newWidth
        }
      })

      const svgParsed = Vue.computed(() => {
        if (typeof props.page != 'string') {
          return null
        }
        const vdoc = new DOMParser().parseFromString(props.page, 'image/svg+xml')
        vdoc.querySelector('svg>title').remove()
        const backgroundElement = vdoc.querySelector(
          'desc+path[fill="#ffffff"]'
        )
        if (backgroundElement) {
          backgroundElement.remove()
        }
        const svg = vdoc.querySelector('svg')
        return [
          svg.getAttribute('viewBox'),
          svg.innerHTML
        ]
      })

      const highlighterElement = Vue.computed(() => {
        if (props.highlighterElid in props.elementsDict) {
          const element = props.elementsDict[props.highlighterElid]
          if (element.page == props.id) {
            return element
          }
        }
        return null
      })
      const clickableElements = Vue.computed(() => {
        const ret = []
        for (let id in props.elementsDict) {
          let element = props.elementsDict[id]
          if (!('page' in element)) continue
          if (element.page == props.id) {
            ret.push(element)
          }
        }
        return ret
      })

      function selectElement(elid) {
        ctx.emit('select', elid)
      }

      return { ref, svgParsed, highlighterElement, clickableElements, selectElement }
    },
    template: /*html*/`
      <div class="slcwd-page" ref="ref">
        <div v-if="typeof page != 'string'" class="slcwd-page-placeholder">
          <div class="slcwd-page-placeholder-i">{{ id + 1 }}</div>
        </div>
        <svg v-else class="slcwd-page-graphic" :viewBox="svgParsed[0]">
          <rect v-if="highlighterElement"
            :x="highlighterElement.pos[0]"
            :y="highlighterElement.pos[1]"
            :width="highlighterElement.size[0]"
            :height="highlighterElement.size[1]"
            fill="#d7e7ff"
          />
          <g v-html="svgParsed[1]" />
          <rect v-for="element in clickableElements"
            :x="element.pos[0]"
            :y="element.pos[1]"
            :width="element.size[0]"
            :height="element.size[1]"
            fill="transparent"
            :style="{cursor: 'pointer'}"
            @click="() => selectElement(element.elid)"
          />
        </svg>
      </div>
    `
  }

  //==============================================

  /**
   * Displays multiple pages.
   *
   * Spec:
   * - The `pages` is an Array made of either `null` (unloaded), `false` (loading) or string (loaded).
   * - The `positions` is the json Object defining the positions of measures or note events.
   * - The `current` is the current playback time, in seconds.
   * - `@select` emits with all the matching timestamps in seconds when the user clicks on a measure.
   */
  const PagesDisplay = {
    emits: ['select'],
    props: {
      loaded: Boolean,
      errored: Boolean,
      pages: [null, Array],
      pageFormat: [null, Object],
      positions: [null, Object],
      audioTime: [null, Number],
      refPagesApi: [null, Object],
      downloads: [null, Array]
    },
    setup(props, ctx) {
      if (props.refPagesApi) props.refPagesApi.value = { toggleAutoScroll, toggleZoomed }

      const ref = Vue.ref(null)
      const zoomed = Vue.ref(false)
      function toggleZoomed() {
        zoomed.value = !zoomed.value
      }
      const innerRef = Vue.ref(null)

      useFrameEffect(function () {
        if (!ref.value) return
        let newHeight = 0
        if (zoomed.value) {
          newHeight = Math.min(1350, ref.value.offsetWidth * 1.45)
        } else {
          newHeight = Math.min(1200, window.innerHeight - 160, ref.value.offsetWidth * 1.3)
        }
        newHeight = newHeight + 'px'
        if (ref.value.style.height != newHeight) {
          ref.value.style.height = newHeight
        }
      })

      const highlighterIndex = { current: 0 }
      const highlighterElid = Vue.computed(() => {
        const eventList = props.positions.events;

        if (props.audioTime == null || eventList.length == 0) {
          return null
        }
        let i = highlighterIndex.current
        if (i < 0 || i >= eventList.length) {
          i = 0
        }
        // Back
        while (i >= 0 && props.audioTime < eventList[i].time) {
          i -= 1
        }
        // Forward
        while (i < eventList.length - 1 && props.audioTime >= eventList[i + 1].time) {
          i += 1
        }
        // Tell
        highlighterIndex.current = i
        if (i < 0) {
          return null
        }
        return eventList[i].elid
      })
      // Auto scroll
      const enableAutoScroll = Vue.ref(true)
      function toggleAutoScroll() {
        enableAutoScroll.value = !enableAutoScroll.value
      }
      Vue.watchEffect(() => {
        if (!enableAutoScroll.value) return
        if (!innerRef.value) return
        if (highlighterElid.value == null) return
        const element = props.positions.elements[highlighterElid.value]
        if (!element) return
        const parent = innerRef.value
        const page = parent.children[element.page]
        if (!page) return

        const viewportWidth = parent.clientWidth
        const pageWidth = page.offsetWidth
        const currentLeft = page.offsetLeft - parent.scrollLeft
        const currentRight = page.offsetLeft + pageWidth - parent.scrollLeft

        const isWithinRange = pageWidth <= viewportWidth ? (
          currentLeft >= 0 && currentRight <= viewportWidth  // requiring the whole page in the viewport
        ) : (
          currentLeft <= viewportWidth && currentRight >= 0  // requiring only some part in the viewport
        )
        if (isWithinRange) return
        const targetLeft = Math.max(
          page.offsetLeft - pageWidth * 0.20,                  // Page to the left with a padding
          page.offsetLeft + pageWidth / 2 - viewportWidth / 2  // Page to the center
        )

        parent.scrollTo({
          left: targetLeft,
          behavior: 'smooth'
        })
      })

      function selectElement(elid) {
        const ret = []
        for (let event of props.positions.events) {
          if (event.elid == elid) {
            ret.push(event.time)
          }
        }
        ctx.emit('select', ret)
      }

      return { ref, innerRef, enableAutoScroll, zoomed, highlighterElid, selectElement, toggleAutoScroll, toggleZoomed }
    },
    components: {
      Page
    },
    template: /*html*/`
      <div class="slcwd-pages-display" ref="ref">
        <div class="slcwd-pages-display-error" v-if="errored">
          <div style="font-size: 64px; opacity: 0.37;"><i class="las la-exclamation-circle"></i></div>
          <p>Failed to load the score.</p>
          <p>Reload the page to try again.</p>
        </div>
        <div class="slcwd-pages-display-empty" v-if="!loaded && !errored"></div>
        <div class="slcwd-pages-display-i" ref="innerRef" v-if="loaded">
          <Page
            v-for="page, id in pages"
            :id="id"
            :page="page"
            :pageFormat="pageFormat"
            :highlighterElid="highlighterElid"
            :elementsDict="positions.elements"
            @select="elid => selectElement(elid)"
          />
        </div>
      </div>
      <div class="slcwd-pages-controls slcwd-button-group">
        <button
          @click="toggleAutoScroll"
          :selected="enableAutoScroll ? '' : null"
          class="slcwd-button"
        >
          <i class="las la-arrows-alt-h"></i> <span class="label">Auto-<span style="text-decoration:underline">s</span>croll</span>
        </button>
        <button
          @click="toggleZoomed"
          :selected="zoomed ? '' : null"
          class="slcwd-button"
        >
          <i class="las la-search-plus"></i> <span class="label"><span style="text-decoration:underline">Z</span>oom</span>
        </button>
        <button
          v-for="download in downloads"
          class="slcwd-button"
        >
          <a :href="download.href" download>
            <i class="las la-file-download"></i> <span class="label">{{ download.name }}</span>
          </a>
        </button>
      </div>
    `
  }

  //==============================================

  const ScorePlayback = {
    props: {
      tracks: Array, // [{ name, src, type:("midi", "audio" or "mscz/..."), soundfont (for midi) }]
      type: String, // file ext of the score
      refAudioApi: [null, Object],
    },
    emits: ['timeChange', 'focusMain'],
    setup(props, ctx) {
      if (props.refAudioApi) props.refAudioApi.value = {
        setCurrentTime: setProgress,
        getCurrentTime: getProgress,
        playPause,
        addProgress,
        nextTrack
      }

      const currentTrackIndex = Vue.ref(0);
      const currentTrack = Vue.computed(() =>
        props.tracks[currentTrackIndex.value] ?? null
      );
      function nextTrack() {
        currentTrackIndex.value = (currentTrackIndex.value+1)% props.tracks.length;
      }

      const loaded = Vue.ref(false);
      const audio = Vue.computed((old_audio) => {
          loaded.value = false

          const thisIndex = currentTrackIndex.value;

          let playing = false;
          let seek_val = 0;
          if (old_audio !== undefined) {
            if (old_audio.playing()) {
              old_audio.pause();
              playing = true;
            }
            seek_val = old_audio.seek();
          }

          const options = {
            src: [currentTrack.value.src],
            preload: 'metadata',
            onload: () => {
              loaded.value = true
              self.seek(seek_val);
              if (playing  && thisIndex === currentTrackIndex.value) // make sure that we have not changed track during loading
                self.play();
            },
            onend: () => {
              // Ensure behavior consistency with web audio
              self.pause()
              self.seek(self.duration())
            },
            soundfont: currentTrack.value.soundfont
          }
          let Constructor;
          switch (currentTrack.value.type) {
            case "audio":
              Constructor = Howl;
              break;
            case "midi":
              Constructor = MidiPlayer;
              break;
            case "mscz/synth":
              options.mscz = currentTrack.value.mscz;
              options.excerpt = currentTrack.value.excerpt;
              options.type = props.type;
              Constructor = WebMscorePlayer;
              break;
            default:
              console.error(`Unknown track type ${currentTrack.value.type}`);
              return;
          }

          const self = new Constructor(options);
          return self;
      })

      const progressbar = Vue.ref(null)
      const isPlaying = Vue.ref(false);
      const progressRatio = Vue.ref(0);
      const loadedRatio = Vue.ref(0)

      function reportCurrent() {
        if (!audio.value) {
          ctx.emit('timeChange', null)
        }
        if (audio.value.playing()) {
          // Keep persistent reporting while playing
          ctx.emit('timeChange', audio.value.seek() ?? null)
        }
      }

      useFrameEffect(() => { // Need this to recompute every frame, as audio.value.playing/seek are not reactive
        reportCurrent()

        if(!audio.value) return
        if(!loaded.value) return  // Only update state when loaded

        isPlaying.value = audio.value.playing()
        if(audio.value.duration() != 0)
          progressRatio.value = audio.value.seek() / audio.value.duration();
      })

      function playPause() {
        if (!audio.value || !loaded.value) return
        if (!audio.value.playing()) {
          if (audio.value.seek() == audio.value.duration()) {
            // Ensure behavior consistency with web audio
            audio.value.seek(0)
          }
          audio.value.play()
        } else {
          audio.value.pause()
        }
      }
      function stop() {
        if (!audio.value) return
        audio.value.pause()
        audio.value.seek(0)
        ctx.emit('timeChange', null)
      }
      function setProgress(time) {
        if (!audio.value) return
        if (time > audio.value.duration()) time = audio.value.duration()
        if (time < 0) time = 0
        audio.value.seek(time)
        ctx.emit('timeChange', time)
      }
      function getProgress() {
        if (!audio.value) return -1
        return audio.value.seek()
      }
      function addProgress(time) {
        if (!audio.value) return
        let newTime = time + audio.value.seek()
        setProgress(newTime)
      }
      function tweakProgressOnBar(event) {
        event.preventDefault()
        if (!audio.value) return
        if (!progressbar.value) return
        const mouseX = event.clientX
        const rect = progressbar.value.getBoundingClientRect()
        const ratio = (mouseX - rect.left) / (rect.right - rect.left)
        const currentTime = ratio * audio.value.duration()
        if (currentTime == currentTime) {
          setProgress(currentTime)
        }
      }
      function progressMouseDown(event) {
        ctx.emit('focusMain')
        if (!audio.value) {
          return
        }
        tweakProgressOnBar(event)
        const wasPlaying = audio.value.playing()
        if (wasPlaying) {
          audio.value.pause()
        }
        document.addEventListener('mousemove', tweakProgressOnBar)
        function cleanup() {
          document.removeEventListener('mousemove', tweakProgressOnBar)
          document.removeEventListener('mouseup', cleanup)
          if (wasPlaying && audio.value.seek() < audio.value.duration()) {
            audio.value.play()
          }
        }
        document.addEventListener('mouseup', cleanup)
      }

      const trackNamesTooltip = Vue.computed(() =>
        props.tracks.map(t => t.name).join('\n')
      );

      return {
        loaded, audio, progressbar, playPause, stop, isPlaying,
        progressRatio, loadedRatio, addProgress, progressMouseDown,
        nextTrack, currentTrack, trackNamesTooltip
      }
    },
    template: /*html*/`
      <div class="slcwd-playback-controls">
        <button
          @click="playPause"
          :disabled="!loaded"
          class="slcwd-button slcwd-playback-button slcwd-pause"
        >
          <i :class="['las', isPlaying ? 'la-pause' : 'la-play']"></i>
        </button>
        <button
          @wheel.prevent="addProgress($event.wheelDelta / 120)"
          @click="stop"
          :disabled="!loaded"
          class="slcwd-button slcwd-playback-button slcwd-stop"
        >
          <i class="las la-stop"></i>
        </button>
        <button class="slcwd-button" @click="nextTrack" :title="trackNamesTooltip">
          {{ currentTrack.name }}
        </button>
        <div class="slcwd-playback-progress">
          <div
            ref="progressbar"
            class="slcwd-playback-progressbar"
            @mousedown.prevent="progressMouseDown"
          >
            <div class="slcwd-playback-progressbar-l" :style="{
              width: loadedRatio * 100 + '%'
            }"></div>
            <div class="slcwd-playback-progressbar-i" :style="{
              width: progressRatio * 100 + '%'
            }"></div>
          </div>
        </div>
      </div>
    `
  }

  //==============================================

  /**
   * The interactive score display.
   *
   * Spec:
   * - `tracks`: array { name, src, type, soundfont } of the tracks to display,
   *     these can also be passed via <score-track> DOM elements
   * - `type`: mscz | mscx | musicxml | midi | wd-data
   * - If type is wd-data, `src` should point to a directory, with or without a trailing slash.
   * - The directory should include:
   *   - `meta.metajson`, the score metadata.
   *   - `graphic-%d.svg`, the SVG of all pages.
   *   - Optionally `measures.mpos`, the measure position references.
   * - If type is mscz, `src` points to the score file
   */
  const ScoreDisplay = {
    props: {
      src: { type: String, required: true },
      tracks: { type: Array, required: false, default: () => [] },
      type: { type: String, required: false, default: "wd-data" }
    },
    setup(props) {
      const tracks_ref = Vue.ref(props.tracks || []);
      const downloads = Vue.ref([]);

      Vue.onMounted(() => {
        const host = Vue.getCurrentInstance().proxy.$el.parentNode;
        requestAnimationFrame(() => { // DOM is not ready yet
          if (!props.tracks.length) {
            const trackElements = host.getElementsByTagName("score-track");
            const trackItems = Array.from(trackElements).map(el => ({
              name: el.textContent.trim(),
              src: el.getAttribute('src') ?? null,
              type: el.getAttribute('type') ?? "audio",
              soundfont: el.getAttribute('sound-font') ?? null
            }));
            tracks_ref.value = trackItems.map((track) => {
              if (!track.type.startsWith("mscz/synth")) return track;

              track.type = track.type.split(":")[0];

              const trackId = track.type.split(":")[1];
              track.excerpt = isNaN(trackId) ? -1 : Number(trackId);

              if (!track.src && !WebMscoreSupported.includes(props.type)) {// We have no mscz source file
                console.error("Could not load trackElement, no mscz given", track);
                return;
              }
              if (!track.src && loader.value != null) {
                track.mscz = loader.value; // Just give it the already built mscz loader
              }
              track.src = track.src ?? props.src;
              return track;
            })
          }

          const downloadElements = host.getElementsByTagName("score-download");
          downloads.value = Array.from(downloadElements).map(el => ({
            name: el.textContent.trim(),
            href: el.getAttribute('href')
          }))
        })
      })

      const refMain = Vue.ref(null)

      const scoreSrc = Vue.ref('')
      const loadToken = Vue.ref(null)

      const scoreMeta = Vue.ref(null)
      const loaded = Vue.computed(() => scoreMeta.value != null)

      const errored = Vue.ref(false)
      const graphics = Vue.ref(null)

      const positions = Vue.ref({elements: [], events: []});

      const audioTime = Vue.ref(null)  // current audio time
      const refAudioApi = Vue.reactive({ value: null })
      const loader = Vue.ref(null);

      function selectTimes(times) {
        if (!refAudioApi.value || times.length == 0) {
          return
        }
        let bestTime = -1, bestDiff = Infinity
        // Pick the best matching timestamp
        for (const time of times) {
          let diff = time - refAudioApi.value.getCurrentTime()
          if (diff < 0) {
            diff = -diff * 1
          }
          if (diff < bestDiff) {
            bestDiff = diff
            bestTime = time
          }
        }
        refAudioApi.value.setCurrentTime(bestTime)
      }
      function playPause() {
        refAudioApi.value && refAudioApi.value.playPause()
      }
      function addProgress(val) {
        refAudioApi.value && refAudioApi.value.addProgress(val)
      }

      const refPagesApi = Vue.reactive({ value: null })
      function handleExactKey(event) {
        if (event.key.toLowerCase() == 's') {
          event.preventDefault()
          refPagesApi.value && refPagesApi.value.toggleAutoScroll()
        }
        if (event.key.toLowerCase() == 'z') {
          event.preventDefault()
          refPagesApi.value && refPagesApi.value.toggleZoomed()
        }
      }

      // Load score data
      Vue.watchEffect(() => {
        if(scoreSrc.value == props.src) {
          return
        }
        scoreSrc.value = props.src

        // Clear state
        scoreMeta.value = null
        loadToken.value = Math.random()
        graphics.value = null
        positions.value = {elements: [], events: []};
        errored.value = false

        let token = loadToken.value; // Use that to see if the data is still relevant once received

        if (WebMscoreSupported.includes(props.type)) {
          loader.value = new WebMscoreLoader(scoreSrc.value, props.type);
        } else if (props.type == "wd-data") {
          loader.value = new WdDataLoader(scoreSrc.value);
        } else {
          console.error(`Unknown source type  "${props.type}".`);
          errored.value = true;
        }

        // Initiate metadata load
        loader.value.loadMetaData().then((meta) => {
          if (token != loadToken.value) return;
          if (!('pages' in meta) && ('metadata' in meta)) {
            scoreMeta.value = meta.metadata
          } else {
            scoreMeta.value = meta
          }
          // Load pages
          graphics.value = Array(scoreMeta.value.pages).fill(null); // It is bad that we don't get images as soon as they are loaded
          loader.value.loadGraphics(scoreMeta.value.pages)
          .then((gr) => {
            if (token != loadToken.value) return;
            graphics.value = gr;

            // If used in an IFrame, let the parent window know that the score is visible
            if (window.parent)
              window.parent.postMessage("scoreDisplay:ready", "*");
          })
          .catch((_err) => {console.warn('loading images failed.', _err); errored.value = true });
        }).catch((_err) => {
          console.warn('metadata load failed.', _err);
          errored.value = true;
        });

        // Initiate positions load
        loader.value.loadPos(false).then((positions_json) => {
          if (token != loadToken.value) return;
          positions.value = positions_json;
        }).catch((_err) => console.warn('events positions load failed.', _err));
      })


      return {
        refMain, scoreMeta, loaded, errored, graphics, positions, audioTime,
        refAudioApi, selectTimes, playPause, addProgress, refPagesApi, handleExactKey, tracks_ref, downloads
      }
    },
    components: { PagesDisplay, ScorePlayback },
    template: /*html*/`
      <div
        tabindex="0"
        ref="refMain"
        class="slcwd-score-display"
        @keydown.space.exact.prevent="playPause"
        @keydown.left.exact.prevent="() => addProgress(-2)"
        @keydown.right.exact.prevent="() => addProgress(+2)"
        @keydown.exact="handleExactKey"
      >
        <PagesDisplay
          :loaded="loaded" :errored="errored"
          :pages="graphics"
          :downloads="downloads"
          :pageFormat="scoreMeta ? scoreMeta.pageFormat : null"
          :positions="positions"
          :audioTime="audioTime"
          @select="times => selectTimes(times)"
          :refPagesApi="refPagesApi"
        />
        <ScorePlayback
          v-if="tracks_ref.length"
          :tracks="tracks_ref"
          :type="type"
          @timeChange="val => audioTime = val"
          @focusMain="refMain && refMain.focus({preventScroll: true})"
          :refAudioApi="refAudioApi"
        />
        <slot></slot>
      </div>
    `
  }

  class TrackElement extends HTMLElement {
    /* Stores `src` and `name` data for its score-display parent */
    connectedCallback() { this.style.display = 'none'; }
  }
  class DownloadElement extends HTMLElement { // We might want to use a Vue component ?
    /* Stores `href` and `name` data for its score-display parent */
    connectedCallback() { this.style.display = 'none'; }
  }
  customElements.define('score-track', TrackElement);
  customElements.define('score-download', DownloadElement);
  customElements.define('score-display', Vue.defineCustomElement(ScoreDisplay, {shadowRoot: false}));
