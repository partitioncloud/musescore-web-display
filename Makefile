no-cdn: target/soundfonts/FluidR3Mono_GM.sf3 webmscore
	npm ci
	mkdir -p target/{soundfonts,modules}
	cp ./score-display/* target -r
	cp ./node_modules/* target/modules -r
	cp ./webmscore/ target/ -r
	patch ./target/score-display.global.js ./patches/score-display.global.js.no-cdn.diff

pages: no-cdn
	cp -r data ./target/
	cp -r style ./target/
	cp index.html ./target/
	patch ./target/index.html ./patches/index.html.no-cdn.diff

target/soundfonts/FluidR3Mono_GM.sf3:
	mkdir -p target/soundfonts
	curl -S https://cdn.jsdelivr.net/gh/musescore/MuseScore@2.1/share/sound/FluidR3Mono_GM.sf3 > target/soundfonts/FluidR3Mono_GM.sf3

webmscore:
	curl -SL https://github.com/CarlGao4/webmscore/releases/download/webmscore-4.3.2/webmscore4-4.3.2.tgz > webmscore4-4.3.2.tgz
	tar -xvzf ./webmscore4-4.3.2.tgz
	mv ./package ./webmscore
	rm ./webmscore4-4.3.2.tgz
