import * as Vue from "vue";


export function useFrameEffect(func) {
    return Vue.watchEffect((cleanup) => {
        let sustain = true
        function adjust() {
            func()
            if (sustain) {
                requestAnimationFrame(adjust)
            }
        }
        requestAnimationFrame(adjust)
        cleanup(() => {
            sustain = false
        })
    })
}