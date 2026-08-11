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

# ── A store build is a decision, not a side effect ────────────────────────
#
# Xcode Cloud's start condition lives in App Store Connect, not in this
# repository, so nothing here can stop it firing on a push. This can stop it
# finishing.
#
# Unless ios/RELEASE_UNLOCKED exists, this exits non-zero before anything is
# built — no archive, no TestFlight upload, no submission, and no spending of
# the daily upload budget that a real release then cannot have.
#
# To cut a build: create the file, commit it, run the build, delete it again.
#
#     touch ios/RELEASE_UNLOCKED && git add -f ios/RELEASE_UNLOCKED
#
# It is deliberately a file rather than a setting, because a file appears in
# the diff of the commit that asked for the build.
if [ ! -f "$REPO_ROOT/ios/RELEASE_UNLOCKED" ]; then
  echo "Refusing to build: ios/RELEASE_UNLOCKED is not present."
  echo "Store builds are off until somebody asks for one. See ci_scripts/ci_post_clone.sh."
  exit 1
fi


# A build number Apple has not seen before.
#
# CURRENT_PROJECT_VERSION is 1 in the project file and nothing moved it, so
# every archive claimed to be build 1 and the second upload of it is rejected
# — after the archive, at the end, having spent the whole build.
#
# Xcode Cloud hands us its own run number; use it. Guarded so that a failure
# here cannot take the build down with it: a wrong build number is a rejected
# upload, and no build number at all is exactly what we have today.
if [ -n "$CI_BUILD_NUMBER" ]; then
  ( cd "$REPO_ROOT/ios/App" && agvtool new-version -all "$CI_BUILD_NUMBER" ) \
    || echo "Could not set the build number to $CI_BUILD_NUMBER — carrying on."
fi

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
