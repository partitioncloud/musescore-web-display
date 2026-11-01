import * as Vue from "vue";


// How often the effects run when they are not busy, in ms
const IDLE_DELAY = 100

/**
 * Run `func` at every frame while `isBusy()` (always, by default), and only every IDLE_DELAY ms otherwise,
 * so that the browser can rest. Returns a function that runs `func` right now.
 */
export function useFrameEffect(func, isBusy = () => true) {
    let running = false
    let frame = null
    let timer = null

    function run() {
        cancelAnimationFrame(frame)
        clearTimeout(timer)
        if (!running) return

        func()
        if (isBusy()) {
            frame = requestAnimationFrame(run)
        } else {
            timer = setTimeout(run, IDLE_DELAY)
        }
    }

    Vue.onMounted(() => {
        running = true
        frame = requestAnimationFrame(run)
    })
    Vue.onUnmounted(() => {
        running = false
        cancelAnimationFrame(frame)
        clearTimeout(timer)
    })

    return run
}