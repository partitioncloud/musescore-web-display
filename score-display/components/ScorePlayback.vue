<template>
<div class="slcwd-playback-controls" ref="rootEl">
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
    <button
      v-if="audioParams != null"
      @click="toggleMixer"
      :class="['slcwd-button', 'slcwd-playback-button', 'slcwd-mixer-btn', { active: showMixer }]"
      :aria-pressed="showMixer"
      aria-label="Audio mixer"
      title="Audio mixer"
    >
        <i class="las la-sliders-h"></i>
    </button>
    <!-- With a single track there is nothing to choose: show its name only -->
    <span v-if="tracks.length < 2" class="slcwd-track-label">{{ currentTrack.name }}</span>
    <div v-else class="slcwd-track-picker">
        <button
          class="slcwd-button slcwd-track-button"
          @click="toggleTrackMenu"
          aria-haspopup="listbox"
          :aria-expanded="showTrackMenu"
          title="Choose the track to play"
        >
            {{ currentTrack.name }} <i class="las la-angle-up"></i>
        </button>
        <div v-if="showTrackMenu" class="slcwd-track-menu" role="listbox">
            <button
              v-for="(track, index) in tracks"
              :key="index"
              class="slcwd-button"
              role="option"
              :aria-selected="index == currentTrackIndex"
              :selected="index == currentTrackIndex ? '' : null"
              @click="selectTrack(index)"
            >
                {{ track.name }}
            </button>
        </div>
    </div>
    <PlaybackMixer
      v-if="audioParams != null"
      :visible="showMixer"
      :audioParams="audioParams"
      @update-params="handleMixerParamsUpdate"
    />
    <!-- The whole area is clickable, the bar itself is only 5px high -->
    <div class="slcwd-playback-progress" @pointerdown.prevent="progressPointerDown">
        <div
          ref="progressbar"
          class="slcwd-playback-progressbar"
        >
        <div class="slcwd-playback-progressbar-l" :style="{
            width: loadedRatio * 100 + '%'
        }"></div>
        <div class="slcwd-playback-progressbar-i" :style="{
            width: progressRatio * 100 + '%'
        }"></div>
        </div>
    </div>
    <span class="slcwd-playback-time">{{ timeLabel }}</span>
</div>
</template>


<script>
import * as Vue from "vue";

import {useFrameEffect} from "../utils.js";

import {Howl} from "howler"; // Howler: audio library
import {MidiPlayer} from "../players/midi.js";
import {WebMscorePlayer} from "../players/webmscore.js";
import PlaybackMixer from "./PlaybackMixer.vue";

export default {
    components: {
        PlaybackMixer,
    },
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
        const showMixer = Vue.ref(false);
        const audioParams = Vue.ref(null);
        const showTrackMenu = Vue.ref(false);
        function selectTrack(index) {
            showTrackMenu.value = false;
            if (index == currentTrackIndex.value) return;
            if (currentTrack.value.type == "mscz/synth") {
                audio.value.destroy();
            }
            currentTrackIndex.value = index;
        }
        function nextTrack() {
            selectTrack((currentTrackIndex.value+1)% props.tracks.length);
        }

        const loaded = Vue.ref(false);
        const audio = Vue.computed((old_audio) => {
            loaded.value = false
            showMixer.value = false; // Close mixer when track changes

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

            if (self.getAudioOutputParams)
                (async () => {
                    audioParams.value = await self.getAudioOutputParams();
                })();

            return self;
        })

        const progressbar = Vue.ref(null)
        const isPlaying = Vue.ref(false);
        const progressRatio = Vue.ref(0);
        const loadedRatio = Vue.ref(0)
        const elapsed = Vue.ref(0);
        const duration = Vue.ref(0);

        function formatTime(seconds) {
            if (!Number.isFinite(seconds)) return '0:00';
            const total = Math.floor(seconds);
            return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
        }
        const timeLabel = Vue.computed(() =>
            `${formatTime(elapsed.value)} / ${formatTime(duration.value)}`
        );

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
            elapsed.value = audio.value.seek();
            duration.value = audio.value.duration();
            if(audio.value.duration() != 0)
                progressRatio.value = audio.value.seek() / audio.value.duration();
        })

        Vue.onUnmounted(() => {
            setPopupCloseListeners(false);
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
        function progressPointerDown(event) {
            ctx.emit('focusMain')
            if (!audio.value) {
                return
            }
            tweakProgressOnBar(event)
            const wasPlaying = audio.value.playing()
            if (wasPlaying) {
                audio.value.pause()
            }
            document.addEventListener('pointermove', tweakProgressOnBar)
            function cleanup() {
                document.removeEventListener('pointermove', tweakProgressOnBar)
                document.removeEventListener('pointerup', cleanup)
                document.removeEventListener('pointercancel', cleanup)
                if (wasPlaying && audio.value.seek() < audio.value.duration()) {
                    audio.value.play()
                }
            }
            document.addEventListener('pointerup', cleanup)
            document.addEventListener('pointercancel', cleanup)
        }

        function toggleMixer() {
            showTrackMenu.value = false;
            showMixer.value = !showMixer.value;
        }
        function toggleTrackMenu() {
            showMixer.value = false;
            showTrackMenu.value = !showTrackMenu.value;
        }

        // Close the popups with Escape or by clicking anywhere outside of the playback bar
        const rootEl = Vue.ref(null);
        function closePopups() {
            showMixer.value = false;
            showTrackMenu.value = false;
        }
        function closeOnEscape(event) {
            if (event.key == 'Escape') closePopups();
        }
        function closeOnOutsideClick(event) {
            if (rootEl.value && !rootEl.value.contains(event.target)) closePopups();
        }
        function setPopupCloseListeners(enabled) {
            const method = enabled ? 'addEventListener' : 'removeEventListener';
            // Capture phase, as the mixer stops keyboard events from bubbling
            document[method]('keydown', closeOnEscape, true);
            document[method]('pointerdown', closeOnOutsideClick, true);
        }
        Vue.watch(() => showMixer.value || showTrackMenu.value, setPopupCloseListeners);

        function handleMixerParamsUpdate(patch) {
            // Updates webmscore audio params & clears queue
            audio.value.setAudioOutputParams(patch);

            // Update PlaybackMixer params
            audioParams.value = {
                master: {
                    ...audioParams.value.master,
                    ...(patch.master || {}),
                },
                tracks: audioParams.value.tracks.map(track => {
                    const updatedTrack = patch.tracks?.find(t => t.trackId === track.trackId);
                    return updatedTrack ? {...track, ...updatedTrack} : track;
                })
            }
        }

        return {
            loaded, audio, progressbar, playPause, stop, isPlaying,
            progressRatio, loadedRatio, addProgress, progressPointerDown, timeLabel,
            nextTrack, currentTrack, currentTrackIndex, selectTrack, showMixer,
            showTrackMenu, toggleTrackMenu, toggleMixer, handleMixerParamsUpdate,
            audioParams, rootEl
        }
    },
}
</script>