#!/bin/sh
# Runs the sh suites (core/scripts, core/template, the adapter scripts and the tools/build.sh one), the
# contract conformance suite (core/contract/conformance/run.sh and edit.sh), tools/build.sh --check,
# tools/script-strings.sh --check and shellcheck inside an Ubuntu container (Linux is proven in a
# local container).
# Call it from the repository root:
#   docker run --rm --platform linux/amd64 -v <repository root>:/repo -w /repo ubuntu:24.04 sh tools/tests/linux.sh
# (linux/amd64 because tools/ci-tools.sh pins Linux binaries for x86_64 only; on an arm64 host the
# container runs emulated.)
# Installs what the suites need (jq) and what shellcheck.sh needs (git, and the shellcheck that CI
# pins, fetched by tools/ci-tools.sh: the apt one is older and flags lines the pinned one accepts),
# and exits 1 if any part fails.

apt-get update -qq >/dev/null || exit 1
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq jq git curl ca-certificates xz-utils >/dev/null || exit 1
sh tools/ci-tools.sh /tmp/ci-tools shellcheck >/dev/null || exit 1
PATH=/tmp/ci-tools:$PATH
export PATH
# Without a UTF-8 locale the image has none, and shellcheck dies printing an "é".
export LC_ALL=C.UTF-8
# The mounted repository has an owner other than the container's root; without this git refuses it.
git config --global --add safe.directory "$(pwd)"

printf '%s\n' "== $(uname -s) $(uname -m), sh=$(readlink /bin/sh 2>/dev/null || printf sh), awk=$(readlink -f /usr/bin/awk 2>/dev/null || printf awk)"
rc=0
printf '%s\n' "== core/scripts/tests/run.sh"
sh core/scripts/tests/run.sh || rc=1
printf '%s\n' "== agents/claude-code/agent-scripts/tests/run.sh"
sh agents/claude-code/agent-scripts/tests/run.sh || rc=1
printf '%s\n' "== core/template/tests/run.sh"
sh core/template/tests/run.sh || rc=1
printf '%s\n' "== core/contract/conformance/run.sh"
sh core/contract/conformance/run.sh --self-test core/template/status.sh || rc=1
printf '%s\n' "== core/contract/conformance/edit.sh"
sh core/contract/conformance/edit.sh --self-test core/template/task.sh || rc=1
printf '%s\n' "== tools/tests/build.sh"
sh tools/tests/build.sh || rc=1
printf '%s\n' "== tools/tests/languages.sh"
sh tools/tests/languages.sh || rc=1
printf '%s\n' "== tools/tests/versions.sh"
sh tools/tests/versions.sh || rc=1
printf '%s\n' "== tools/tests/release.sh"
sh tools/tests/release.sh || rc=1
printf '%s\n' "== tools/build.sh --check"
sh tools/build.sh --check || rc=1
printf '%s\n' "== tools/script-strings.sh --check"
sh tools/script-strings.sh --check || rc=1
printf '%s\n' "== tools/tests/header.sh"
sh tools/tests/header.sh || rc=1
printf '%s\n' "== tools/tests/pt-br.sh"
sh tools/tests/pt-br.sh --self-test || rc=1
printf '%s\n' "== tools/tests/internal-pointers.sh"
sh tools/tests/internal-pointers.sh --self-test || rc=1
printf '%s\n' "== tools/tests/no-pt-in-tests.sh"
sh tools/tests/no-pt-in-tests.sh --self-test || rc=1
printf '%s\n' "== tools/tests/no-pt-in-en.sh"
sh tools/tests/no-pt-in-en.sh --self-test || rc=1
printf '%s\n' "== tools/tests/shellcheck.sh"
sh tools/tests/shellcheck.sh --self-test || rc=1
sh tools/tests/shellcheck.sh || rc=1
exit "$rc"
