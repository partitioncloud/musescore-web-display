<template>
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
    <button class="slcwd-button" @click="nextTrack">
        {{ currentTrack.name }}
    </button>
    <div class="slcwd-playback-tooltip">
        {{ trackNamesTooltip }}
    </div>
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
</template>


<script>
import * as Vue from "vue";

import {useFrameEffect} from "../utils.js";

import {Howl} from "howler"; // Howler: audio library
import {MidiPlayer} from "../players/midi.js";
import {WebMscorePlayer} from "../players/webmscore.js"

export default {
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
            if (currentTrack.value.type == "mscz/synth") {
                audio.value.destroy();
            }
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

        Vue.onUnmounted(() => {
            stop();
            if (currentTrack.value.type == "mscz/synth") {
                audio.value.destroy();
            }
        });

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
}
</script>