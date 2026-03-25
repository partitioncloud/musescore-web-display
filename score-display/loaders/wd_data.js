
// Load data from an .mscz.wd url
export class WdDataLoader {

  constructor (src) {
    this.src = src;
  }

  async loadMetaData() {
    const response = await fetch(this.src + '/meta.metajson');
    return await response.json();
  }

  /** Load measures positions, set savePositions=true to load each note event position */
  async loadPos(savePositions) {
    if (savePositions) { console.warn("Attempting to load positions with savePositions=true for a wd-data score")}

    const response = await fetch(this.src + '/measures.mpos');
    const mposXml = new DOMParser().parseFromString(await response.text() ?? '<none />', 'application/xml'); // What happens if not found ?

    const event_items = mposXml.querySelectorAll('event')
    const events = []
    for (let i = 0; i < event_items.length; i++) {
      const item = event_items[i]
      events.push({
        elid: Number(item.getAttribute('elid')),
        time: item.getAttribute('position') / 1000
      })
    }

    const posScale = 12
    const element_items = mposXml.querySelectorAll('element')
    const elements = {}
    for (let i = 0; i < element_items.length; i++) {
      const item = element_items[i]
      const element = {
        elid: item.getAttribute('id'),
        pos: [item.getAttribute('x') / posScale, item.getAttribute('y') / posScale],
        size: [item.getAttribute('sx') / posScale, item.getAttribute('sy') / posScale],
        page: +item.getAttribute('page')
      }
      const minWidth = 64
      if (element.size[0] < minWidth) {
        // element.pos[0] -= (minWidth - element.size[0]) / 2
        element.size[0] = minWidth
      }
      elements[item.getAttribute('id')] = element
    }

    return {
      "events": events,
      "elements": elements
    }
  }

  async _loadPage(pageId) {
    const url = this.src + `/graphic-${pageId+1}.svg`;
    const response = await fetch(url);
    return await response.text();
  }

  async loadGraphics(count) {
    let graphics = Array(count).fill(null);

    for (let i = 0; i < graphics.length; i++) {
      graphics[i] = await this._loadPage(i); // TODO: load only 3 at a time ?
    }

    return graphics;
  }

  async destroy() {}
}
