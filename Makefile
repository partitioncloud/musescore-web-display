JS_SOURCES := $(wildcard score-display/*.js score-display/**/*.js score-display/**/*.vue) rolldown.config.mjs
WEBMSCORE_VERSION := 4.7.5-1
WEBMSCORE_SOURCE  := https://github.com/partitioncloud/webmscore/releases/download/webmscore-$(WEBMSCORE_VERSION)/webmscore4-$(WEBMSCORE_VERSION).tgz
WEBMSCORE         := ./webmscore$(WEBMSCORE_VERSION)
BUNDLES           := target/score-display.rolldown.js $(addprefix target/score-display.rolldown.,$(addsuffix .js,no-cdn no-mm no-mm+no-cdn))
ROLLDOWN          := node_modules/.bin/rolldown --config rolldown.config.mjs --intro="const LIB_WEBMSCORE_VERSION='$(WEBMSCORE_VERSION)';"

target: target/soundfonts/FluidR3Mono_GM.sf3 target/score-display.rolldown.js target/score-display.rolldown.no-cdn.js target/pdfjs $(WEBMSCORE)
	mkdir -p target/soundfonts
	cp ./score-display/score-display.css target
	cp $(WEBMSCORE)/ target/ -r

all: target pages $(BUNDLES)

# The variants are selected in rolldown.config.mjs, from the environment
$(BUNDLES): node_modules $(JS_SOURCES)
	mkdir -p target
	NO_CDN=$(if $(findstring no-cdn,$@),1) NO_MM=$(if $(findstring no-mm,$@),1) $(ROLLDOWN) --input score-display/score-display.global.js --file $@

### Dependencies ###
target/soundfonts/FluidR3Mono_GM.sf3:
	mkdir -p target/soundfonts
	curl -S https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3 > target/soundfonts/FluidR3Mono_GM.sf3

target/pdfjs: node_modules
	mkdir -p target/pdfjs
	cp node_modules/pdfjs-dist/legacy/build/pdf.min.mjs node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs target/pdfjs/

target/style/line-awesome: node_modules
	mkdir -p target/style/line-awesome/fonts target/style/line-awesome/css
	cp -r node_modules/line-awesome/dist/line-awesome/fonts/* target/style/line-awesome/fonts/
	cp -r node_modules/line-awesome/dist/line-awesome/css/line-awesome.min.css target/style/line-awesome/css/

$(WEBMSCORE):
	curl -SL $(WEBMSCORE_SOURCE) > webmscore4.tgz
	tar -xvzf ./webmscore4.tgz
	mv ./package $(WEBMSCORE)
	rm ./webmscore4.tgz

node_modules:
	npm ci

### GitHub Pages ###
pages: target target/style/line-awesome pages/html pages/style
	mkdir -p pages
	cp -r target/* ./pages/
	cp -r data ./pages/
	mv pages/score-display.rolldown.no-cdn.js pages/score-display.rolldown.js
	sed -i 's/LIB_WEBMSCORE = "\.\.\/webmscore\//LIB_WEBMSCORE = ".\/webmscore'$(WEBMSCORE_VERSION)'\//' pages/score-display.rolldown.js

pages/style: $(wildcard style/*.css)
	mkdir -p pages/style
	cp -r style/* ./pages/style

pages/html: index.html viewer.html
	mkdir -p pages
	cp index.html ./pages/
	cp viewer.html ./pages/
	sed -i 's#https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/#./style/line-awesome/css/#' pages/viewer.html


clean::
	rm -rf pages target
