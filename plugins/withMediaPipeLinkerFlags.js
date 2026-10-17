// Expo config plugin: links MediaPipe's core library into the app.
//
// MediaPipeTasksCommon needs `-force_load` of its graph library, set through
// `OTHER_LDFLAGS[sdk=iphoneos*]` (and the simulator variant) in its pod's
// user_target_xcconfig. When a second pod sets the same conditional setting,
// CocoaPods can't merge them ("Can't merge user_target_xcconfig") and drops
// both, and the app fails to link with ~400 undefined MediaPipe/TFLite
// symbols (this happened with react-native-executorch, since removed). The
// flag is set on the app target instead, where `$(inherited)` still pulls in
// every pod's regular flags from the Pods xcconfig.
const { withXcodeProject } = require("expo/config-plugins");

const MEDIAPIPE_GRAPH = "$(PODS_ROOT)/MediaPipeTasksCommon/frameworks/graph_libraries";

const FLAGS = {
  "OTHER_LDFLAGS[sdk=iphoneos*]": [
    "-force_load",
    `${MEDIAPIPE_GRAPH}/libMediaPipeTasksCommon_device_graph.a`,
  ],
  "OTHER_LDFLAGS[sdk=iphonesimulator*]": [
    "-force_load",
    `${MEDIAPIPE_GRAPH}/libMediaPipeTasksCommon_simulator_graph.a`,
  ],
};

module.exports = function withMediaPipeLinkerFlags(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const { firstTarget } = project.getFirstTarget();
    const configList = project.pbxXCConfigurationList()[firstTarget.buildConfigurationList];
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const { value } of configList.buildConfigurations) {
      const settings = buildConfigs[value].buildSettings;
      // A conditional setting replaces the plain one for that SDK, so it
      // carries the target's own flags (-ObjC, -lc++) along.
      const plain = settings.OTHER_LDFLAGS ?? ['"$(inherited)"'];
      const base = (Array.isArray(plain) ? plain : [plain]).map((flag) => String(flag).replace(/^"(.*)"$/, "$1"));
      if (!base.includes("$(inherited)")) base.unshift("$(inherited)");
      for (const [key, flags] of Object.entries(FLAGS)) {
        // pbxproj keys and values with brackets/`$(...)` must be quoted.
        settings[JSON.stringify(key)] = [...base, ...flags].map((flag) => JSON.stringify(flag));
      }
    }
    return cfg;
  });
};
