/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */
/*2*/'use strict';
/*3*/function foo(a) {
/*4*/  process.nextTick(function() {
/*5*/    a = 0;
/*6*/  });
/*7*/}
/*8*/module.exports = foo;