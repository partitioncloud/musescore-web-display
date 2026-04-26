<template>
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
      :errorMessage="errorMessage"
      :pages="graphics"
      :downloads="downloads"
      :pageFormat="scoreMeta ? scoreMeta.pageFormat : null"
      :positions="positions"
      :audioTime="audioTime"
      @select="times => selectTimes(times)"
      @download="download"
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
</template>


<script>
import * as Vue from "vue";
import {saveAs} from 'file-saver';

import {WebMscoreLoader,WebMscoreSupported,LIB_WEBMSCORE_MAJOR} from "../loaders/webmscore.js"
import {WdDataLoader} from "../loaders/wd_data.js"

import ScorePlayback from "./ScorePlayback.vue";
import PagesDisplay from "./PagesDisplay.vue";

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
export default {
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

        const errorMessage = Vue.ref("Reload the page to try again.")
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
                errorMessage.value = `Please note that scores written with MuseScore > v${LIB_WEBMSCORE_MAJOR} are not supported.`
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

        Vue.onUnmounted(() => {
            if (loader.value)
                loader.value.destroy()
            }
        )

        async function download(element, callback, errcallback) {
            try {
            let dataLoc = element.href;
            let filename = null;
            if (dataLoc.startsWith("mscz/export:")) {
                if (!WebMscoreSupported.includes(props.type)) // We have no mscz source file
                    throw "Could not save file, score is not loaded from websmcore";
                if (loader.value == null)
                    throw "Loader not available.";

                const exportFormat = dataLoc.split(":")[1];
                const data = await loader.value.exportAs(exportFormat);
                filename = `${scoreMeta.value.title}.${exportFormat}`;
                dataLoc = new Blob([data]);
            } else {
                filename = element.href.substr(element.href.lastIndexOf("/")+1);
            }

            saveAs(dataLoc, filename);
            callback();

            } catch (error) {
                console.error(`While exporting for "${element.name}" : ${error}`);
                errcallback();
            }
        }


        return {
            refMain, scoreMeta, loaded, errored, graphics, positions, audioTime,
            refAudioApi, selectTimes, playPause, addProgress, refPagesApi, handleExactKey, tracks_ref, downloads,
            errorMessage, download
        }
    },
    components: { PagesDisplay, ScorePlayback },
  }
</script>