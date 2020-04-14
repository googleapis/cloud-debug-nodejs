const path = require('path');

module.exports = {
  mode: 'none',
  entry: './in.ts_',
  output: {
    path: path.resolve(__dirname),
    filename: 'out.js',
  },
  devtool: 'source-map',
  optimization: {
    nodeEnv: false,
  },
};
