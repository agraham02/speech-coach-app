#!/usr/bin/env bash
# Session 06 iOS link spike, without a Mac: do ONNX Runtime's iOS pod and
# MediaPipe's force-loaded graph library define the same global symbols?
# A duplicate strong symbol is a link error ("duplicate symbol"), so any
# overlap means the two can't be linked into the app as they ship.
#
#   bash ios_link_overlap.sh WORK_DIR [ORT_VERSION] [MEDIAPIPE_URL]
#
# Needs curl, unzip, tar and llvm-nm (the Android NDK has one:
# $ANDROID_SDK/ndk/<version>/toolchains/llvm/prebuilt/<host>/bin/llvm-nm).
# Downloads about 125 MB into WORK_DIR (keep it outside the repo).
#
# Result on 2026-10-23: onnxruntime-c 1.24.3 exports 1,845 global symbols and
# 824 of them are also defined by libMediaPipeTasksCommon_device_graph.a
# (0.10.35): XNNPACK (xnn_*), KleidiAI (kai_*), cpuinfo_* and pthreadpool_*,
# all strong. onnxruntime-c 1.30.0 (what an unpinned pod resolves to): 1,027.
# Because the app must -force_load the MediaPipe graph library
# (plugins/withMediaPipeLinkerFlags.js), every one of its objects is loaded,
# so pulling ORT's single prelinked object in for OrtGetApiBase would
# collide. Neither pod sets user_target_xcconfig, so this is not the
# CocoaPods merge problem ExecuTorch had; it is a plain duplicate-symbol one.
set -euo pipefail
WORK=${1:?work dir}
ORT=${2:-1.24.3}
MP=${3:-https://dl.google.com/cpdc/20260427-204214/MediaPipeTasksCommon-0.10.35.tar.gz}
NM=${NM:-llvm-nm}
mkdir -p "$WORK/ort" "$WORK/mp"
cd "$WORK"
[ -f ort.zip ] || curl -sL -o ort.zip "https://download.onnxruntime.ai/pod-archive-onnxruntime-c-$ORT.zip"
[ -f mp.tar.gz ] || curl -sL -o mp.tar.gz "$MP"
(cd ort && unzip -qo ../ort.zip)
(cd mp && tar xzf ../mp.tar.gz 2>/dev/null || true)
"$NM" -g --defined-only ort/onnxruntime.xcframework/ios-arm64/onnxruntime.framework/onnxruntime 2>/dev/null | awk 'NF>=3{print $NF}' | sort -u > ort_names.txt
"$NM" -g --defined-only mp/frameworks/graph_libraries/libMediaPipeTasksCommon_device_graph.a 2>/dev/null | awk 'NF>=3{print $NF}' | sort -u > mp_names.txt
comm -12 ort_names.txt mp_names.txt > common.txt
echo "ORT globals: $(wc -l < ort_names.txt)  MediaPipe globals: $(wc -l < mp_names.txt)  both: $(wc -l < common.txt)"
sed 's/^_//' common.txt | sed -E 's/^([a-z]+_[a-z]+).*/\1/' | sort | uniq -c | sort -rn | head -10
