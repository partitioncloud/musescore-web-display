<template>
<div class="slcwd-page" ref="ref">
    <div v-if="typeof page != 'string'" class="slcwd-page-placeholder">
        <div class="slcwd-page-placeholder-i">{{ id + 1 }}</div>
    </div>
    <svg v-else class="slcwd-page-graphic" :viewBox="svgParsed[0]">
        <rect v-if="highlighterElement"
          :x="highlighterElement.pos[0]"
          :y="highlighterElement.pos[1]"
          :width="highlighterElement.size[0]"
          :height="highlighterElement.size[1]"
          fill="#d7e7ff"
        />
        <g v-html="svgParsed[1]" />
        <rect v-for="element in clickableElements"
          :x="element.pos[0]"
          :y="element.pos[1]"
          :width="element.size[0]"
          :height="element.size[1]"
          fill="transparent"
          :style="{cursor: 'pointer'}"
          @click="() => selectElement(element.elid)"
        />
    </svg>
</div>
</template>


<script>
import * as Vue from "vue";

import {useFrameEffect} from "../utils.js";

export default {
    emits: ['select'],
    props: {
        id: Number,
        page: [null, Boolean, String],
        pageFormat: Object,
        highlighterElid: [null, Number],
        elementsDict: Object,
    },
    setup(props, ctx) {
        const pageFormat = props.pageFormat
        const ref = Vue.ref(null)

        useFrameEffect(() => {
            if (!ref.value) return
            const newWidth = (ref.value.clientHeight - 2) * pageFormat.width / pageFormat.height + 'px'
            if (ref.value.style.width != newWidth) {
                ref.value.style.width = newWidth
                ref.value.style.fontSize = newWidth
            }
        })

        const svgParsed = Vue.computed(() => {
            if (typeof props.page != 'string') {
                return null
            }
            const vdoc = new DOMParser().parseFromString(props.page, 'image/svg+xml')
            vdoc.querySelector('svg>title').remove()
            const backgroundElement = vdoc.querySelector(
                'desc+path[fill="#ffffff"]'
            )
            if (backgroundElement) {
                backgroundElement.remove()
            }
            const svg = vdoc.querySelector('svg')
            return [
                svg.getAttribute('viewBox'),
                svg.innerHTML
            ]
        })

        const highlighterElement = Vue.computed(() => {
            if (props.highlighterElid in props.elementsDict) {
                const element = props.elementsDict[props.highlighterElid]
                if (element.page == props.id) {
                    return element
                }
            }
            return null
        })

        const clickableElements = Vue.computed(() => {
            const ret = []
            for (let id in props.elementsDict) {
            let element = props.elementsDict[id]
            if (!('page' in element)) continue
            if (element.page == props.id) {
                ret.push(element)
            }
            }
            return ret
        })

        function selectElement(elid) {
            ctx.emit('select', elid)
        }

        return { ref, svgParsed, highlighterElement, clickableElements, selectElement }
    },
}
</script>