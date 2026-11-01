export const DEFAULT_SOUNDFONT = "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

// NO_CDN is defined at build time, see rolldown.config.mjs.
// The no-cdn bundles serve those files from next to the bundle instead.
const local = (path) => new URL(path, import.meta.url).href;

export const LINE_AWESOME_CSS = NO_CDN
  ? local("style/line-awesome/css/line-awesome.min.css")
  : "https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css";

export const WEBMSCORE_SOUNDFONT = NO_CDN
  ? local("soundfonts/FluidR3Mono_GM.sf3")
  : "https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3";

// The legacy build is used so that older browsers are supported too
export const PDFJS_DIRECTORY = NO_CDN
  ? local("pdfjs/")
  : "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/";
