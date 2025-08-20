const path = require('path');
const { merge } = require('webpack-merge');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Base configuration with optimizations
const baseConfig = {
  entry: {
    app: path.resolve(__dirname, 'src/index.ts')
  },
  
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true, // Faster builds
              experimentalWatchApi: true
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@components': path.resolve(__dirname, 'src/components')
    },
    // Suppress warnings for missing optional dependencies
    fallback: {
      "../appsettings.secrets": false
    }
  },
  
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // Split large libraries into separate chunks
        googleai: {
          test: /[\\/]node_modules[\\/]@google\/generative-ai[\\/]/,
          name: 'google-ai',
          chunks: 'all',
          priority: 30,
          enforce: true
        },
        mapbox: {
          test: /[\\/]node_modules[\\/]mapbox-gl[\\/]/,
          name: 'mapbox',
          chunks: 'all',
          priority: 20,
          enforce: true
        },
        turf: {
          test: /[\\/]node_modules[\\/]@turf[\\/]/,
          name: 'turf',
          chunks: 'all',
          priority: 15
        },
        ethers: {
          test: /[\\/]node_modules[\\/]ethers[\\/]/,
          name: 'ethers',
          chunks: 'all',
          priority: 15
        },
        zetachain: {
          test: /[\\/]node_modules[\\/]@zetachain[\\/]/,
          name: 'zetachain',
          chunks: 'all',
          priority: 10
        },
        mobile: {
          test: /mobile-.*\.ts$/,
          name: 'mobile',
          chunks: 'async',
          priority: 15
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5,
          reuseExistingChunk: true
        }
      }
    },
    runtimeChunk: {
      name: 'runtime'
    },
    usedExports: true,
    sideEffects: false
  },
  
  output: {
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].chunk.js',
    path: path.join(__dirname, 'public'),
    clean: true, // Clean output directory
    hashFunction: 'sha256'
  },
  
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      inject: 'body'
    })
  ],

  performance: {
    hints: 'warning',
    maxEntrypointSize: 500000, // 500KB
    maxAssetSize: 300000 // 300KB
  }
};
