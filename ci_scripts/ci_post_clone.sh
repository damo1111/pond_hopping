#!/bin/sh
# Xcode Cloud post-clone step.
#
# The iOS web assets (ios/App/App/public) are git-ignored — they're
# generated from the React/Vite app by `npm run build` + `npx cap sync`.
# Xcode Cloud clones the repo fresh and would otherwise build an empty
# shell, so we build the web app and sync it into the iOS project here,
# before Xcode compiles the native wrapper.
set -e

# Node isn't preinstalled on Xcode Cloud runners; install the latest via
# Homebrew (satisfies Capacitor's Node >= 22 requirement).
brew install node

# CI_PRIMARY_REPOSITORY_PATH is the freshly-cloned repo root.
cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci
npm run build
npx cap sync ios
