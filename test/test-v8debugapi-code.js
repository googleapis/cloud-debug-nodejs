/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */
/*2*/'use strict';
/*3*/function foo(n) {
/*4*/  // some comments.
/*5*/  var A = [1, 2, 3]; var B = { a: 5, b: 6, c: 7 };
/*6*/  return n+42+A[0]+B.b;
/*7*/}
/*8*/function getterObject() {
/*9*/  var hasGetter = { _a: 5, get a() { return this._a; }, b: 'hello world' };
/*10*/ return hasGetter.a;
/*11*/}
/*12*/module.exports = {
/*13*/  foo: foo,
/*14*/  getterObject: getterObject
/*15*/};
