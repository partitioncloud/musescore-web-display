<template>
  <div class="slcwd-track-mixer">
    <p class="slcwd-track-name">{{ trackName }}</p>
    <input type="range"
        @input="(e) => ctx.emit('update-volume', parseFloat(e.target.value))"
        max="12" min="-60" step="0.1" title="Volume"
        :value="trackAudioParams.volume"
    />
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
        return { ctx }
    },
  }
</script>