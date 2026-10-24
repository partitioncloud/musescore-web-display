// Load a PDF file with pdf.js (https://mozilla.github.io/pdf.js/).
// Like webmscore, it is only loaded when needed.
// The legacy build is used so that older browsers are supported too.
const LIB_PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/";

// Pages are rendered to images, at 3 times the PDF resolution (72 dpi)
const RENDER_SCALE = 3;


let pdfjs;
async function ensure_pdfjs() {
  if (pdfjs === undefined) {
    pdfjs = import(LIB_PDFJS + "pdf.min.mjs").then((module) => {
      module.GlobalWorkerOptions.workerSrc = LIB_PDFJS + "pdf.worker.min.mjs";
      return module;
    });
  }

  return await pdfjs;
}


// Load data from a PDF file
export class PdfLoader {
  constructor (src) {
    this.src = src;

    this.pdf = this.load_pdf();
  }

  async load_pdf() {
    const lib = await ensure_pdfjs();
    const response = await fetch(this.src);

    return await lib.getDocument({
      data: new Uint8Array(await response.arrayBuffer())
    }).promise;
  }

  async loadMetaData() {
    const pdf = await this.pdf;
    const page = await pdf.getPage(1);
    const {width, height} = page.getViewport({scale: 1});

    return {
      pages: pdf.numPages,
      pageFormat: {width: width, height: height}
    };
  }

  /** There is no way to know when a measure is played from a PDF */
  async loadPos(savePositions) {
    return {
      events: [],
      elements: {}
    };
  }

  /** Render a page as an SVG that only contains an image, as the pages display expects SVGs */
  async _loadPage(pageId) {
    const pdf = await this.pdf;
    const page = await pdf.getPage(pageId + 1);

    const {width, height} = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: RENDER_SCALE});

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({canvas: canvas, viewport: viewport}).promise;

    const image = canvas.toDataURL("image/png");
    page.cleanup();

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`
      + `<title>Page ${pageId + 1}</title>`
      + `<image href="${image}" width="${width}" height="${height}" />`
      + `</svg>`;
  }

  async loadGraphics(count) {
    let graphics = Array(count).fill(null);

    for (let i = 0; i < graphics.length; i++) {
      graphics[i] = await this._loadPage(i);
    }

    return graphics;
  }

  async exportAs(format) {
    throw "PdfLoader can't generate an export.";
  }

  async destroy() {
    let pdf = await this.pdf;
    pdf.destroy();
  }
}
