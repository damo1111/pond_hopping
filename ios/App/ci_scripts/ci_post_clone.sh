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
# repository, so nothing here can stop a build firing. This can stop one
# finishing — no archive, no TestFlight upload, no submission, and no
# spending of the daily upload budget that a real release then cannot have.
#
# Two things count as somebody having decided, and a build needs one of them.
#
# A TAG. Cutting a tag and pushing it cannot be done by accident, it is
# named, and it records which commit shipped. This is the way to cut a
# release, and it is why the gate now opens for one.
#
# THE FILE, ios/RELEASE_UNLOCKED, for the occasional build off a branch.
# Deliberately a file rather than a setting, because a file appears in the
# diff of the commit that asked for the build:
#
#     touch ios/RELEASE_UNLOCKED && git add -f ios/RELEASE_UNLOCKED
#
# and it is deleted again once that build has uploaded. It was not deleted:
# it sat in the tree for twenty-nine commits, six of them in one evening,
# each of which was therefore eligible to spend the upload budget. A brake
# nobody releases is not a brake. The tag route exists so that the ordinary
# case never needs the file at all.
#
# CI_TAG is set by Xcode Cloud when a tag started the build. If it is ever
# absent when it ought not to be, the gate falls straight back to requiring
# the file — the failure mode is a refused build, never an unasked-for one.
#
# A MANUAL START. Pressing Start Build in App Store Connect is a person
# deciding, in the same way cutting a tag is — it cannot happen on a push, it
# cannot happen by accident, and somebody had to open the page and choose the
# workflow and the branch.
#
# This one was learnt by wasting a build. The gate used to accept only a tag
# or the file, so a manual build had to be preceded by committing the file —
# and a manual build pins the commit at the moment the button is pressed. Do
# both and it is a race: build 124 pinned 3e0c989 seconds before the unlock
# commit landed, refused, and cost fifty-nine seconds and a round trip to
# work out why. The file was on main. The build simply predated it.
#
# CI_WORKFLOW is set on every Xcode Cloud run, so it cannot stand in for
# "manual" on its own. CI_START_CONDITION is the one that says how the build
# began.
if [ -z "$CI_TAG" ] \
  && [ "$CI_START_CONDITION" != "manual" ] \
  && [ ! -f "$REPO_ROOT/ios/RELEASE_UNLOCKED" ]; then
  echo "Refusing to build: not a tag, not a manual start, and ios/RELEASE_UNLOCKED is not present."
  echo "Store builds are off until somebody asks for one. See ci_scripts/ci_post_clone.sh."
  exit 1
fi
if [ -n "$CI_TAG" ]; then
  echo "Building because: tag $CI_TAG"
elif [ "$CI_START_CONDITION" = "manual" ]; then
  echo "Building because: somebody pressed Start Build"
else
  echo "Building because: ios/RELEASE_UNLOCKED is present"
fi
echo "Start condition reported as: ${CI_START_CONDITION:-<unset>}" 


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

# ── The build variables Vercel has and this runner does not ──────────────
#
# VITE_WAYS_IN is read at *build* time, through import.meta.env, and baked
# into the bundle. Vercel has it set, so the web sheet offers Apple and
# Google. Xcode Cloud is a different machine with a different environment and
# nobody ever set it here — so every TestFlight build has shipped with an
# empty provider list and an email-and-code sheet, while the web showed all
# three. Reported as "no google apple login" on iOS, with the web working
# perfectly, which is exactly what this produces.
#
# Verified by building both ways and reading the sheet: without it the sheet
# offers only a code; with it, Continue with Apple and Continue with Google.
#
# Apple is not optional here. App Store guideline 4.8 requires Sign in with
# Apple wherever a third-party sign-in is offered, so an iOS build that
# offered Google alone would be rejected.
export VITE_WAYS_IN="${VITE_WAYS_IN:-apple,google}"
echo "Building with ways in: $VITE_WAYS_IN"

npm ci
npm run build

# ── Where the iOS shell gets its web app from ────────────────────────────
#
# By default the IPA carries a copy of dist/. That copy is frozen at the
# moment of the build, so a fix deployed to pond.eend.app at four o'clock is
# still not on the phone at six — it needs a new build, an upload, a review
# for external TestFlight, and a tester who remembers to update. Android has
# never worked that way: its workflow rewrites this same file to point at the
# live site, which is why a web fix reaches an Android tester on next launch
# and an iOS tester a day later. The same bug therefore gets reported twice.
#
# So TestFlight builds point at the live site too, and iterating no longer
# costs a build.
#
# THE RISK, stated plainly rather than discovered at review. App Store
# guideline 4.2 (minimum functionality) is what a wrapper around a website
# fails, and Beta App Review applies it to external TestFlight groups as well
# as to submissions. This is a real chance of a rejection, accepted
# deliberately: the app is a PWA with native camera, push and photo access,
# not a web view of a marketing site, and the cost of being wrong is a
# rejection notice rather than anything shipped to anybody.
#
# ios/STORE_BUILD turns it off and bundles the assets, for a submission.
# A file, so it appears in the diff of the commit that asked for it — and
# unlike ios/RELEASE_UNLOCKED, forgetting to delete it fails safe: a stale
# STORE_BUILD produces an ordinary self-contained app, not an unasked-for one.
if [ -f "$REPO_ROOT/ios/STORE_BUILD" ]; then
  echo "Bundling the web assets into the app: ios/STORE_BUILD is present."
else
  echo "Pointing the iOS shell at https://pond.eend.app — web fixes arrive without a build."
  node -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
    c.server = { url: "https://pond.eend.app", cleartext: false };
    fs.writeFileSync("capacitor.config.json", JSON.stringify(c, null, 2));
    console.log(c.server);
  '
fi

npx cap sync ios

# capacitor-swift-pm is a *transitive* dependency (App.xcodeproj depends on
# the local CapApp-SPM package, which in turn depends on capacitor-swift-pm
# remotely). Xcode Cloud disables automatic package resolution for the
# actual archive step, and on a cold build machine with no warm SPM cache
# it can fail to even verify the committed Package.resolved is satisfied.
# Resolve explicitly here, with normal (non-restricted) permissions, so the
# package is already cloned and cached by the time xcodebuild archives.
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App
