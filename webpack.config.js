const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const webpack = require("webpack");
require("dotenv").config();

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  // 🔒 SECURITY: Define ONLY PUBLIC environment variables to be exposed to the app
  // ⚠️ WARNING: These values will be visible in the client-side bundle!
  // 🚨 NEVER include sensitive API keys, private keys, or secrets here
  const exposedEnvVariables = {
    NODE_ENV: argv.mode || "development",
    // API base URL for token endpoint (dev → local express, prod → same origin)
    API_BASE_URL: argv.mode === "production" ? "" : "http://localhost:3000",
    // Public configuration only
    ENABLE_WEB3: process.env.ENABLE_WEB3 || "true",
    ENABLE_AI_FEATURES: process.env.ENABLE_AI_FEATURES || "true",
    ENABLE_CROSS_CHAIN: process.env.ENABLE_CROSS_CHAIN || "true",
    AUTO_CONNECT_WALLET: process.env.AUTO_CONNECT_WALLET || "true",
    // 🔒 SECURITY: API keys removed from webpack - use secure token endpoints instead
    // MAPBOX_ACCESS_TOKEN: REMOVED FOR SECURITY
    // GOOGLE_GEMINI_API_KEY: REMOVED FOR SECURITY
    // Public RPC URLs (these are meant to be public)
    ZETACHAIN_RPC_URL:
      process.env.ZETACHAIN_RPC_URL ||
      "https://zetachain-athens-evm.blockpi.network/v1/rpc/public",
    ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL || "",
    POLYGON_RPC_URL: process.env.POLYGON_RPC_URL || "",
    // Contract addresses (these become public once deployed)
    TERRITORY_NFT_ADDRESS: process.env.TERRITORY_NFT_ADDRESS || "",
    REALM_TOKEN_ADDRESS: process.env.REALM_TOKEN_ADDRESS || "",
    TERRITORY_MANAGER_ADDRESS: process.env.TERRITORY_MANAGER_ADDRESS || "",
  };

  // Entry points configuration
  const entry = {
    app: path.resolve(__dirname, "src/index.ts"),
  };

  // Add development setup script only in development mode
  if (!isProduction) {
    entry.devSetup = path.resolve(__dirname, "src/dev-setup.ts");
  }

  return {
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? "source-map" : "eval-source-map",

    entry: entry,

    output: {
      path: path.join(__dirname, "public"),
      publicPath: "/",
      filename: isProduction ? "[name].[contenthash].js" : "[name].js",
      chunkFilename: isProduction ? "[name].[contenthash].js" : "[name].js",
      clean: true,
      hashFunction: "sha256",
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: true,
                experimentalWatchApi: true,
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },

    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@core": path.resolve(__dirname, "src/core"),
        "@services": path.resolve(__dirname, "src/services"),
        "@components": path.resolve(__dirname, "src/components"),
      },
      fallback: {
        process: require.resolve("process/browser"),
      },
    },

    optimization: {
      minimize: isProduction,
      minimizer: isProduction
        ? [
            new TerserPlugin({
              terserOptions: {
                mangle: {
                  keep_classnames: true,
                  keep_fnames: true,
                },
                compress: {
                  passes: 2,
                },
                format: {
                  comments: false,
                },
                keep_classnames: true,
                keep_fnames: true,
              },
              extractComments: false,
            }),
          ]
        : [],
      splitChunks: {
        chunks: "all",
        cacheGroups: {
          googleai: {
            test: /[\\/]node_modules[\\/]@google\/generative-ai[\\/]/,
            name: "google-ai",
            chunks: "all",
            priority: 30,
            enforce: true,
          },
          mapbox: {
            test: /[\\/]node_modules[\\/].*mapbox*?[\\/]/,
            name: "mapbox",
            chunks: "all",
            priority: 20,
            enforce: true,
          },
          turf: {
            test: /[\\/]node_modules[\\/]@turf[\\/]/,
            name: "turf",
            chunks: "all",
            priority: 15,
          },
          ethers: {
            test: /[\\/]node_modules[\\/](ethers|@ethersproject)[\\/]/,
            name: "ethers",
            chunks: "all",
            priority: 15,
          },
          zetachain: {
            test: /[\\/]node_modules[\\/]@zetachain[\\/]/,
            name: "zetachain",
            chunks: "all",
            priority: 10,
          },
          mobile: {
            test: /mobile-.*\.ts$/,
            name: "mobile",
            chunks: "async",
            priority: 15,
          },
          common: {
            name: "common",
            minChunks: 2,
            chunks: "all",
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      },
      runtimeChunk: {
        name: "runtime",
      },
      usedExports: true,
      sideEffects: false,
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "src/template.html"),
        filename: "index.html",
        inject: "body",
        minify: isProduction
          ? {
              removeComments: true,
              collapseWhitespace: true,
              removeRedundantAttributes: true,
              useShortDoctype: true,
              removeEmptyAttributes: true,
              removeStyleLinkTypeAttributes: true,
              keepClosingSlash: true,
              minifyJS: true,
              minifyCSS: true,
              minifyURLs: true,
            }
          : false,
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "static"),
            to: path.resolve(__dirname, "public"),
            noErrorOnMissing: true,
          },
        ],
      }),
      new webpack.DefinePlugin({
        __ENV__: JSON.stringify(exposedEnvVariables),
        "process.env.NODE_ENV": JSON.stringify(argv.mode || "development"),
      }),
      new webpack.ProvidePlugin({
        process: "process/browser",
        Buffer: ["buffer", "Buffer"],
      }),
    ],

    performance: {
      hints: isProduction ? "warning" : false,
      maxEntrypointSize: 1000000, // 1MB - increased for crypto libraries
      maxAssetSize: 500000, // 500KB - increased for large dependencies
    },

    devServer: {
      static: {
        directory: path.join(__dirname, "public"),
      },
      compress: true,
      port: 8080,
      host: "localhost",
      hot: true,
      open: false,
      historyApiFallback: true,
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      ],
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },
  };
};
