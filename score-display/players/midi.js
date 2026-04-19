import * as mm from "../../node_modules/@magenta/music/es6/core.js";
import {DEFAULT_SOUNDFONT} from "../config.js";

/** Returns a promise that fulfills once magenta and Tone.js are loaded */
function ensure_magenta() {
  if (typeof mm !== 'undefined') return Promise.resolve();
  console.error("Can't load a MIDI track, not bundled with Magenta Music.");
  return Promise.reject();
}

/** Wrapper of a MagentaJS player to have the same interface as howler's Howl */
export class MidiPlayer {
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
