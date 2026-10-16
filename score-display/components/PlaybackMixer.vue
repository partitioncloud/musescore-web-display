<template>
  <div class="slcwd-mixer">
    <TrackMixer
      :trackAudioParams="audioParams.master"
      trackName="Master"
      trackId="master"
      @toggle-muted="toggleMuted('master')"
      @toggle-solo="toggleSolo('master')"
      @update-volume="updateVolume('master', $event)"
    />
    <TrackMixer v-for="track in filteredTracks"
      :key="track.trackId"
      :trackAudioParams="track"
      :trackName="track.trackName"
      :trackId="track.trackId"
      @toggle-muted="toggleMuted(track.trackId)"
      @toggle-solo="toggleSolo(track.trackId)"
      @update-volume="updateVolume(track.trackId, $event)"
    />
  </div>
</template>

<script>
import * as Vue from "vue";
import TrackMixer from "./TrackMixer.vue";

export default {
    emits: ['update-params'],
    props: {
      audioParams: Object,
    },
    components: {
      TrackMixer,
    },
    setup(props, ctx) {
        const filteredTracks = Vue.computed(() => {
          return (props.audioParams?.tracks || []).filter(track => !track.trackName.startsWith('Aux ') && track.trackName != "Metronome");
        });

        function getParams(trackId) {
          for (let track of props.audioParams?.tracks || []) {
            if (track.trackId == trackId)
              return track;
          }
          console.error(`No params found for trackId=${trackId}`);
          return {};
        }

        function toggleMuted(trackId) {
          if (trackId == 'master') {
            return ctx.emit('update-params', {master: {muted: !props.audioParams.master.muted}});
          }
          ctx.emit('update-params', {tracks: [{trackId: trackId, muted: !getParams(trackId).muted}]});
        }

        function toggleSolo(trackId) {
          if (trackId == 'master') {
            return ctx.emit('update-params', {master: {solo: !props.audioParams.master.solo}});
          }
          ctx.emit('update-params', {tracks: [{trackId: trackId, solo: !getParams(trackId).solo}]});
        }

        function updateVolume(trackId, volume) {
          if (trackId == 'master') {
            return ctx.emit('update-params', {master: {volume: volume}});
          }
          ctx.emit('update-params', {tracks: [{trackId: trackId, volume: volume}]});
        }

        return { filteredTracks, toggleMuted, toggleSolo, updateVolume }
    },
  }
</script>