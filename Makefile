# Wireman — release build targets
#
# Usage:
#   make mac         → dist/Wireman-*.dmg          (arm64, macOS 10.12+)
#   make win         → dist/Wireman Setup *.exe     (x64, Windows NSIS installer)
#   make win-arm     → dist/Wireman Setup *.exe     (arm64, Surface/Snapdragon)
#   make linux       → dist/Wireman-*.AppImage      (x64)
#   make all         → mac + win + linux (x64 for win/linux)
#   make clean       → remove dist/ and out/

.PHONY: all mac win win-arm linux clean

all: mac win linux

mac:
	npm run package -- --mac

win:
	npm run package -- --win --arch x64

win-arm:
	npm run package -- --win --arch arm64

linux:
	npm run package -- --linux --arch x64

clean:
	rm -rf dist out
