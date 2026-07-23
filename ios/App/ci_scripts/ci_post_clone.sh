#!/bin/sh
# Xcode Cloud post-clone step.
#
# The iOS web assets (ios/App/App/public, config.xml) are git-ignored —
# they're generated from the React/Vite app by `npm run build` + `npx cap
# sync`. Xcode Cloud clones fresh, so without this the Archive fails with
# "public/config.xml couldn't be opened". Build the web app and sync it
# into the iOS project here, before Xcode compiles the native wrapper.
#
# This script lives in BOTH ci_scripts/ (repo root) and ios/App/ci_scripts/
# (next to the Xcode project) because Xcode Cloud's discovery of ci_scripts
# is inconsistent for projects in a subfolder — whichever it runs, the repo
# root is resolved robustly below, and the work is idempotent.
set -e

# Node isn't preinstalled on Xcode Cloud runners.
brew install node

# Resolve the repo root whether this runs from repo-root/ci_scripts or
# ios/App/ci_scripts.
REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

npm ci
npm run build
npx cap sync ios
