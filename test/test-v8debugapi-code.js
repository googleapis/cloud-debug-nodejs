/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */
/*2*/'use strict';
/*3*/function foo(n) {
/*4*/  var A = [1, 2, 3]; var B = { a: 5, b: 6, c: 7 };
/*5*/  return n+42+A[0]+B.b;
/*6*/}
/*7*/function getterObject() {
/*8*/  var hasGetter = { _a: 5, get a() { return this._a; }, b: 'hello world' };
/*9*/  return hasGetter.a;
/*10*/}
/*11*/module.exports = {
/*12*/  foo: foo,
/*13*/  getterObject: getterObject
/*14*/};