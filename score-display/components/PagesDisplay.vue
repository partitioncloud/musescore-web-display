<template>
<div class="slcwd-pages-display" ref="ref">
    <div class="slcwd-pages-display-error" v-if="errored">
        <div style="font-size: 64px; opacity: 0.37;"><i class="las la-exclamation-circle"></i></div>
        <p>Failed to load the score.</p>
        <p>{{ errorMessage }}</p>
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
      v-if="downloads.length == 1"
      @click="() => download(downloads[0], () => {}, () => {})"
      class="slcwd-button"
    >
        <i class="las la-file-download"></i> <span class="label">{{ downloads[0].name }}</span>
    </button>
    <button
      v-if="downloads.length > 1"
      class="slcwd-button"
      @click="openExportPopup"
    >
        <i class="las la-file-download"></i> <span class="label">Download</span>
    </button>
</div>
<ExportPopup
  v-show="showExportPopup"
  :downloads=downloads
  @close="closeExportPopup"
  @download="download"
/>
</template>


<script>
import * as Vue from "vue";

import {useFrameEffect} from "../utils.js";

import ExportPopup from "./ExportPopup.vue";
import Page from "./Page.vue";

/**
 * Displays multiple pages.
 *
 * Spec:
 * - The `pages` is an Array made of either `null` (unloaded), `false` (loading) or string (loaded).
 * - The `positions` is the json Object defining the positions of measures or note events.
 * - The `current` is the current playback time, in seconds.
 * - `@select` emits with all the matching timestamps in seconds when the user clicks on a measure.
 */
export default {
    emits: ['select'],
    props: {
        loaded: Boolean,
        errored: Boolean,
        errorMessage: String,
        pages: [null, Array],
        pageFormat: [null, Object],
        positions: [null, Object],
        audioTime: [null, Number],
        refPagesApi: [null, Object],
        downloads: [null, Array]
    },
    setup(props, ctx) {
        if (props.refPagesApi) props.refPagesApi.value = { toggleAutoScroll, toggleZoomed }

        const showExportPopup = Vue.ref(false);
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

        function download(element, callback, errcallback) {
            ctx.emit('download', element, callback, errcallback);
        }

        function closeExportPopup () {
            showExportPopup.value = false;
        }
        function openExportPopup () {
            showExportPopup.value = true;
        }

        return { ref, innerRef, enableAutoScroll, zoomed, highlighterElid, selectElement, toggleAutoScroll, toggleZoomed, download, openExportPopup, closeExportPopup, showExportPopup }
    },
    components: {
        Page, ExportPopup
    },
}
</script>
