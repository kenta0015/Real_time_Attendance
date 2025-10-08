module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",                  // keep root for "@/lib/*"
            "@/app": "./app",
            "@/styles": "./app/styles",
            "@/ui": "./app/ui",
            "@/organize": "./app/organize",
            "@/lib": "./lib"
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
        }
      ],
      "react-native-reanimated/plugin"
    ]
  };
};
