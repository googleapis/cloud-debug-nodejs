/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */ /* jshint shadow:true */
/*2*/'use strict';
/*3*/class Item {
/*4*/  constructor() {
/*5*/    this.price = 2;
/*6*/  }
/*7*/  getPrice() {
/*8*/    return this.price;
/*9*/  }
/*10*/  increasePriceByOne() {
/*11*/    this.price += 1;
/*12*/  }
/*13*/}
/*14*/function foo() {
/*15*/  var item = new Item();
/*16*/  item.increasePriceByOne();
/*17*/  item.increasePriceByOne();
/*18*/}
/*19*/module.exports = {
/*20*/  foo: foo
/*21*/};
