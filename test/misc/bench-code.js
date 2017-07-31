/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */
/*2*/'use strict';
/*3*/function fib(n) {
/*4*/  return n < 2 ? n : fib(n-2) + fib(n-1);
/*5*/}
/*6*/module.exports = fib;