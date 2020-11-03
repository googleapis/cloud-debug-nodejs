'use strict';
// eslint-disable-next-line no-unused-vars
const a = new Array(50).map(() => {
  return ',';
});
module.exports.rec = function rec(n) {
  if (n === 0) {
    return 5;
  } else {
    return rec(n - 1);
  }
};
