const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = function override(config, env) {
    config.plugins.push(new CopyPlugin({
        patterns: [
            {from: 'public', to: 'public'}
        ]
    }))
    if (process.env.NO_BUNDLE_ANALYSER !== "true") {
        config.plugins.push(new BundleAnalyzerPlugin());
    }
    if (process.env.BUILD_TARGET === "lib") {
        config.entry = [
            path.resolve(process.cwd(), "src", "libroot.ts")
        ]

        config.output = {
            path: config.output.path,
            filename: 'web-marker.js',
            library: "web-marker",
            libraryTarget: "umd",
        }

        delete config.optimization["splitChunks"];
        delete config.optimization["runtimeChunk"];
        config.externals = ["react", "react-dom"];
        config.plugins = config.plugins.filter(p => ["HtmlWebpackPlugin", "GenerateSW", "ManifestPlugin"].indexOf(p.constructor.name) < 0)
    }
    return config;
}
