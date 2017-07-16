/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */
/*2*/'use strict';
/*3*/function foo(b) {/* jshint validthis: true */
/*4*/ this.a = 10;
/*5*/ this.a += b;
/*6*/ return this;
/*7*/}
/*8*/function bar(j) {
/*9*/ return j;
/*10*/}
/*11*/module.exports = {
/*12*/  foo: foo,
/*13*/  bar: bar
/*14*/};