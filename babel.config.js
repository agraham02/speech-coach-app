module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets-core: required by react-native-vision-camera's frame
    // processors (and this project's face-detector package, which uses it internally).
    // react-native-reanimated/plugin: required by Reanimated 4 (re-exports
    // react-native-worklets/plugin). Per Reanimated's docs, worklet plugins must
    // be listed last.
    plugins: ["react-native-worklets-core/plugin", "react-native-reanimated/plugin"],
  };
};
