
const path = require('path');

module.exports = {
  mode: 'none',
  entry: './in.ts_',
  output: {
    path: path.resolve(__dirname),
    filename: 'out.js'
  },
  optimization: {
    nodeEnv: false
  }
};
