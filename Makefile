JS_SOURCES := $(wildcard score-display/*.js score-display/**/*.js)
WEBMSCORE_VERSION := 4.6.5
WEBMSCORE_SOURCE  := https://github.com/augustin64/MuseScore/releases/download/webmscore-$(WEBMSCORE_VERSION)/webmscore4-$(WEBMSCORE_VERSION).tgz
WEBMSCORE := ./webmscore$(WEBMSCORE_VERSION)

target: target/soundfonts/FluidR3Mono_GM.sf3 target/score-display.rolldown.js $(WEBMSCORE)
	mkdir -p target/soundfonts
	cp ./score-display/score-display.css target
	cp $(WEBMSCORE)/ target/ -r

all: target pages target/score-display.rolldown.no-mm.js

target/score-display.rolldown.js: node_modules $(JS_SOURCES) patches/score-display.rolldown.js.no-cdn.diff
	mkdir -p target
	node_modules/.bin/rolldown score-display/score-display.global.js --file target/score-display.rolldown.js
	cp target/score-display.rolldown.js target/score-display.rolldown.no-cdn.js
	patch target/score-display.rolldown.no-cdn.js patches/score-display.rolldown.js.no-cdn.diff

target/score-display.rolldown.no-mm.js: node_modules $(JS_SOURCES) patches/midiplayer.js.no-mm.diff
	mkdir -p build-no-mm
	echo $(JS_SOURCES)
	cp score-display/* build-no-mm/ -r
	patch build-no-mm/players/midi.js patches/midiplayer.js.no-mm.diff
	node_modules/.bin/rolldown build-no-mm/score-display.global.js --file target/score-display.rolldown.no-mm.js
	rm build-no-mm -rf
	cp target/score-display.rolldown.no-mm.js target/score-display.rolldown.no-mm+no-cdn.js
	patch target/score-display.rolldown.no-mm+no-cdn.js patches/score-display.rolldown.js.no-cdn.diff

### Dependencies ###
target/soundfonts/FluidR3Mono_GM.sf3:
	mkdir -p target/soundfonts
	curl -S https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3 > target/soundfonts/FluidR3Mono_GM.sf3

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
	rm pages/*.orig
	mv pages/score-display.rolldown.no-cdn.js pages/score-display.rolldown.js
	sed -i 's/LIB_WEBMSCORE = "\.\.\/webmscore\//LIB_WEBMSCORE = ".\/webmscore'$(WEBMSCORE_VERSION)'\//' pages/score-display.rolldown.js

pages/style: $(wildcard style/*.css)
	mkdir -p pages/style
	cp -r style/* ./pages/style

pages/html: index.html viewer.html patches/viewer.html.no-cdn.diff
	mkdir -p pages
	cp index.html ./pages/
	cp viewer.html ./pages/
	patch pages/viewer.html patches/viewer.html.no-cdn.diff


clean::
	rm -rf pages target build-no-mm