/* 1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */ /* jshint shadow:true */
/* 2*/'use strict';
/* 3*/module.exports.foo = function () {
/* 4*/  const a = {};
/* 5*/  const b = { a, c: this };
/* 6*/  a.b = b;
/* 7*/  this.x = this;
/* 8*/  this.y = a;
/* 9*/  return this;
/*10*/}
