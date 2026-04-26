import Vue from "unplugin-vue/rolldown";

export default {
  resolve: {
    alias: {
      vue: "vue/dist/vue.esm-browser.prod.js",
      "@magenta/music": "@magenta/music/es6/core.js",
    }
  },
  plugins: [Vue()]
};
