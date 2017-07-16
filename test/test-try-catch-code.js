/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */ /* jshint shadow:true */
/*2*/'use strict';
/*3*/function foo() {
/*4*/ try {
/*5*/   throw new Error('A test');
/*6*/ } catch (e) {
/*7*/   var e = 2;
/*8*/   return e;
/*9*/ }
/*10*/}
/*11*/module.exports = foo;