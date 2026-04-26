import * as Vue from "vue";

import ScoreDisplay from "./components/ScoreDisplay.vue";

/** Simply load a stylesheet */
function loadStylesheet(href) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

loadStylesheet("https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css");


class TrackElement extends HTMLElement {
  /* Stores `src` and `name` data for its score-display parent */
  connectedCallback() { this.style.display = 'none'; }
}
class DownloadElement extends HTMLElement { // We might want to use a Vue component ?
  /* Stores `href` and `name` data for its score-display parent */
  connectedCallback() { this.style.display = 'none'; }
}
customElements.define('score-track', TrackElement);
customElements.define('score-download', DownloadElement);
customElements.define('score-display', Vue.defineCustomElement(ScoreDisplay, {shadowRoot: false}));
