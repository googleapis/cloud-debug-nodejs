/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */ /* jshint shadow:true */
/*2*/'use strict';
/*3*/function foo(a) {
/*4*/ var a = 10;
/*5*/ a += 1;
/*6*/ return (function (b) {
/*7*/   var a = true;
/*8*/   return a;
/*9*/ }());
/*10*/}
/*11*/module.exports = foo;