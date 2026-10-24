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
      :views="views"
      :viewIndex="viewIndex"
      @viewChange="index => viewIndex = index"
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
import {PdfLoader} from "../loaders/pdf.js"

import ScorePlayback from "./ScorePlayback.vue";
import PagesDisplay from "./PagesDisplay.vue";

/**
 * The interactive score display.
 *
 * Spec:
 * - `tracks`: array { name, src, type, soundfont } of the tracks to display,
 *     these can also be passed via <score-track> DOM elements
 * - `type`: mscz | mscx | musicxml | midi | wd-data | pdf
 * - If type is wd-data, `src` should point to a directory, with or without a trailing slash.
 * - The directory should include:
 *   - `meta.metajson`, the score metadata.
 *   - `graphic-%d.svg`, the SVG of all pages.
 *   - Optionally `measures.mpos`, the measure position references.
 * - If type is mscz or pdf, `src` points to the score file
 * - Other sources to display the score from can be added with <score-view src type> elements.
 *   If there are several, the user can switch between them. The first one is displayed by default,
 *   after `src` if it is a view: always for pdf & wd-data, for mscz only with `isView` (or if there is no <score-view>)
 */
export default {
    props: {
        src: { type: String, required: true },
        tracks: { type: Array, required: false, default: () => [] },
        type: { type: String, required: false, default: "wd-data" },
        isView: { type: Boolean, required: false, default: false }
    },
    setup(props) {
        const tracks_ref = Vue.ref(props.tracks || []);
        const downloads = Vue.ref([]);

        Vue.onMounted(() => {
            const host = Vue.getCurrentInstance().proxy.$el.parentNode;
            requestAnimationFrame(() => { // DOM is not ready yet
                extraViews.value = Array.from(host.getElementsByTagName("score-view")).map(el => newView(
                    el.textContent.trim(), el.getAttribute('src'), el.getAttribute('type') ?? "pdf"
                ))

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

        // The pages can be displayed from several views: `src` itself, and the <score-view> elements.
        const mainView = Vue.shallowRef(null)
        const extraViews = Vue.shallowRef(null)  // null until the <score-view> elements are read
        const viewIndex = Vue.ref(0)

        const views = Vue.computed(() => {
            if (extraViews.value == null) return []

            // `src` is only used for the audio and the exports if it is a mscz and another view is available
            const mainIsView = props.isView || !extraViews.value.length || !WebMscoreSupported.includes(props.type)
            return mainIsView ? [mainView.value, ...extraViews.value] : extraViews.value
        })
        const view = Vue.computed(() => views.value[viewIndex.value] ?? views.value[0])

        const noPositions = {elements: [], events: []}
        const scoreMeta = Vue.computed(() => view.value?.meta ?? null)
        const loaded = Vue.computed(() => scoreMeta.value != null)
        const errorMessage = Vue.computed(() => view.value?.errorMessage ?? "Reload the page to try again.")
        const errored = Vue.computed(() => view.value?.errored ?? false)
        const graphics = Vue.computed(() => view.value?.graphics ?? null)
        const positions = Vue.computed(() => view.value?.positions ?? noPositions)

        const audioTime = Vue.ref(null)  // current audio time
        const refAudioApi = Vue.reactive({ value: null })
        const loader = Vue.computed(() => mainView.value.loader);  // for the audio and the exports

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

        function newView(name, src, type) {
            return Vue.shallowReactive({
                name: name || (type == "pdf" ? "PDF" : "Score"),
                src, type,
                loader: null, started: false,
                meta: null, graphics: null, positions: noPositions,
                errored: false, errorMessage: "Reload the page to try again."
            })
        }

        function createLoader(view) {
            if (WebMscoreSupported.includes(view.type)) {
                view.loader = new WebMscoreLoader(view.src, view.type);
                view.errorMessage = `Please note that scores written with MuseScore > v${LIB_WEBMSCORE_MAJOR} are not supported.`
            } else if (view.type == "wd-data") {
                view.loader = new WdDataLoader(view.src);
            } else if (view.type == "pdf") {
                view.loader = new PdfLoader(view.src);
            } else {
                console.error(`Unknown source type  "${view.type}".`);
                view.errored = true;
            }
        }

        // Create the loader for `src` (it may be needed for the audio even if it is not displayed)
        Vue.watchEffect(() => {
            mainView.value = newView(null, props.src, props.type)
            createLoader(mainView.value)
        })

        // Load the pages of a view when it is displayed for the first time
        Vue.watch(view, (view) => {
            if (view && !view.started) loadView(view)
        }, { immediate: true })

        function loadView(view) {
            view.started = true;
            if (!view.loader) createLoader(view);
            if (!view.loader) return;

            // Initiate metadata load
            view.loader.loadMetaData().then((meta) => {
            if (!('pages' in meta) && ('metadata' in meta)) {
                view.meta = meta.metadata
            } else {
                view.meta = meta
            }
            // Load pages
            view.graphics = Array(view.meta.pages).fill(null); // It is bad that we don't get images as soon as they are loaded
            view.loader.loadGraphics(view.meta.pages)
            .then((gr) => {
                view.graphics = gr;

                // If used in an IFrame, let the parent window know that the score is visible
                if (window.parent)
                    window.parent.postMessage("scoreDisplay:ready", "*");
            })
            .catch((_err) => {console.warn('loading images failed.', _err); view.errored = true });
            }).catch((_err) => {
                console.warn('metadata load failed.', _err);
                view.errored = true;
            });

            // Initiate positions load
            view.loader.loadPos(false).then((positions_json) => {
                view.positions = positions_json;
            }).catch((_err) => console.warn('events positions load failed.', _err));
        }

        Vue.onUnmounted(() => {
            for (const view of [mainView.value, ...(extraViews.value ?? [])])
                if (view.loader)
                    view.loader.destroy()
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
                filename = `${mainView.value.meta?.title ?? "score"}.${exportFormat}`;
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
            errorMessage, download, views, viewIndex
        }
    },
    components: { PagesDisplay, ScorePlayback },
  }
</script>