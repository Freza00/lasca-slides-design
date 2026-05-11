#!/bin/bash
# Portable launcher — resolves the app directory relative to this script's
# location, so the repo works on any machine after `git clone`.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/app" && exec node node_modules/.bin/next dev --webpack -p "${PORT:-3000}"
