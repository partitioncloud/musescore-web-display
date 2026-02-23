no-cdn:
	npm ci
	mkdir -p target/soundfonts
	cp ./score-display/* target -r
	patch ./target/score-display.global.js ./score-display/score-display.global.js.no-cdn.diff
	cp ./node_modules/ target/modules -r
	cp ./webmscore/ target/webmscore -r
	curl -S https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3 > target/soundfonts/FluidR3Mono_GM.sf3
