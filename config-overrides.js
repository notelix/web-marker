const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const path = require("path");

module.exports = function override(config, env) {
  if (process.env.ANALYZE_BUNDLE === "true") {
    config.plugins.push(new BundleAnalyzerPlugin());
  }
  if (process.env.BUILD_TARGET === "lib") {
    config.entry = [path.resolve(process.cwd(), "src", "libroot.ts")];

    config.output = {
      ...config.output,
      filename: "web-marker.js",
      globalObject: "this",
      library: "web-marker",
      libraryTarget: "umd",
    };

    delete config.optimization["splitChunks"];
    delete config.optimization["runtimeChunk"];
    config.externals = ["react", "react-dom"];
    config.plugins = config.plugins.filter(
      (plugin) =>
        !["HtmlWebpackPlugin", "GenerateSW", "ManifestPlugin"].includes(
          plugin.constructor.name,
        ),
    );
  }
  return config;
};
