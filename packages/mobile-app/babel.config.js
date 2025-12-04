module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          extensions: [".ts", ".tsx", ".js", ".json"],
          alias: {
            "@runrealm/shared-core": "../shared-core",
            "@runrealm/shared-types": "../shared-types",
            "@runrealm/shared-utils": "../shared-utils",
            "@runrealm/shared-blockchain": "../shared-blockchain",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
