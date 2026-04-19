import {WebMscoreLoader} from "../loaders/webmscore.js";
import {DEFAULT_SOUNDFONT} from "../config.js";

export class WebMscorePlayer {
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
    this.BUFFER_WAIT_LENGTH = 64;

    this.audioCtx = new (AudioContext || webkitAudioContext)({latencyHint: "interactive"});
    this.currentTime = 0;
    this.waitForProcessing = true; // waiting for the buffer queue to refill

    this.mscz = options.mscz || new WebMscoreLoader(
      options.src.at(0),
      this.score_type,
      {soundfont: options.soundfont || DEFAULT_SOUNDFONT}
    );
    this.load_data(options.onload);
    this.destroy = async () => {
      if (options.mscz) return;
      let score = await this.mscz.score;
      score.destroy(false);
    }
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

  // When there is no data to play, fill output buffer with zeroes
  outputBufferFillZeroes(e) {
    for (let c = 0; c < this.CHANNELS; c++) {
      e.outputBuffer.getChannelData(c).fill(0);
    }
  }

  setupProcessor() {
    const processor = this.audioCtx.createScriptProcessor(
      this.FRAME_LENGTH,
      0,
      this.CHANNELS
    );
    this.currentTime = 0;

    // At each frame, we retrieve a piece of synthesized audio from BUFFER_QUEUE
    processor.onaudioprocess = (e) => {
      if (this.BUFFER_QUEUE.length === 0) {
        // There is nothing left in the queue
        this.outputBufferFillZeroes(e);
        if (this.synth_complete) {
          // There is nothing in the queue and everything is already synthesized
          if (this.is_playing) this.onend();
          return;
        }
        if (!this.waitForProcessing) {
          console.warn("WebMscorePlayer: Empty buffer queue");
          this.BUFFER_WAIT_LENGTH = Math.min(256, this.BUFFER_WAIT_LENGTH * 2);
          this.waitForProcessing = true;
        }

        return;
      }

      if (this.waitForProcessing) {
        if (this.BUFFER_QUEUE.length < this.BUFFER_WAIT_LENGTH && !this.synth_complete) {
          return this.outputBufferFillZeroes(e);
        }
        this.waitForProcessing = false;
      }

      const frame = this.BUFFER_QUEUE.shift();
      for (let c = 0; c < this.CHANNELS; c++) {
        const channel = e.outputBuffer.getChannelData(c);
        channel.set(frame.chunk[c]);
      }
      this.currentTime = frame.startTime;
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
      this.BUFFER_QUEUE.push({
        chunk: chunk,
        startTime: res.startTime
      });

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

      this.currentTime = start_time;
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

      return Math.min(this.currentTime, this.duration());
    }

    // We want to start ON the selected note, so we seek a bit earlier
    time = Math.max(time-0.01, 0);
    (async () => {
      // We clear the current buffer queue
      await this.stopSynth();
      this.stopSynth = async () => {};

      this.synth_complete = false // we don't want onend to be called
      this.BUFFER_QUEUE = [];
      this.waitForProcessing = true;

      this.next_seek = time;

      if (this.is_playing)
        this.play(); // Re-start synthesizing
    })()
  }
}