import Vue from "unplugin-vue/rolldown";
import {fileURLToPath} from "node:url";

// Bundle variants, selected by the Makefile
const noCdn = process.env.NO_CDN == "1"; // Serve line-awesome, the soundfont and pdf.js from next to the bundle
const noMm = process.env.NO_MM == "1"; // Don't bundle Magenta Music, which is only used by MIDI tracks

export default {
  resolve: {
    alias: {
      vue: "vue/dist/vue.esm-browser.prod.js",
      "@magenta/music": noMm
        ? fileURLToPath(new URL("./score-display/players/magenta-stub.js", import.meta.url))
        : "@magenta/music/es6/core.js",
    }
  },
  transform: {
    define: { NO_CDN: String(noCdn) }
  },
  plugins: [Vue()]
};
