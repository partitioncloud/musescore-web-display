<template>
  <div class="slcwd-track-mixer">
    <p class="slcwd-track-name" :title="trackName">{{ trackName }}</p>
    <input type="range"
        @input="onInput"
        @dblclick="resetVolume"
        max="12" min="-60" step="0.1" title="Volume (double-click to reset)"
        :value="volume"
    />
    <span class="slcwd-track-db">{{ volume.toFixed(1) }} dB</span>
    <div class="slcwd-track-mixer-buttons">
        <button title="Mute" @click="() => ctx.emit('toggle-muted')"
          :active="trackAudioParams.muted"
        >
            <i class="las la-volume-mute"></i>
        </button>
         <button title="Solo" @click="() => ctx.emit('toggle-solo')"
          :active="trackAudioParams.solo"
        >
          S
        </button>
    </div>
  </div>
</template>

<script>
import * as Vue from "vue";

export default {
    emits: ['update-volume', 'toggle-solo', 'toggle-muted'],
    props: {
      trackAudioParams: Object,
      trackName: String,
      trackId: [String, Number],
    },
    setup(props, ctx) {
        // Each volume update re-synthesizes the audio: emit at most once per VOLUME_THROTTLE_MS
        const VOLUME_THROTTLE_MS = 100;

        // The slider follows this local value, so dragging stays smooth between two emits
        const volume = Vue.ref(props.trackAudioParams.volume);
        Vue.watch(() => props.trackAudioParams.volume, (value) => {
            volume.value = value;
        });

        let lastEmit = 0;
        let timeout = null;

        function emitVolume() {
            timeout = null;
            lastEmit = Date.now();
            ctx.emit('update-volume', volume.value);
        }

        function onInput(event) {
            volume.value = parseFloat(event.target.value);
            if (timeout) return; // The latest value will be sent by the pending emit
            const wait = Math.max(0, lastEmit + VOLUME_THROTTLE_MS - Date.now());
            timeout = setTimeout(emitVolume, wait);
        }

        function resetVolume() {
            clearTimeout(timeout);
            volume.value = 0;
            emitVolume();
        }

        Vue.onUnmounted(() => clearTimeout(timeout));

        return { ctx, volume, onInput, resetVolume }
    },
  }
</script>