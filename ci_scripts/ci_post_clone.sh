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

# capacitor-swift-pm is a *transitive* dependency (App.xcodeproj depends on
# the local CapApp-SPM package, which in turn depends on capacitor-swift-pm
# remotely). Xcode Cloud disables automatic package resolution for the
# actual archive step, and on a cold build machine with no warm SPM cache
# it can fail to even verify the committed Package.resolved is satisfied.
# Resolve explicitly here, with normal (non-restricted) permissions, so the
# package is already cloned and cached by the time xcodebuild archives.
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App
