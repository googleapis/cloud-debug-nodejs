/*1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */ /* jshint shadow:true */
/*2*/'use strict';
/*3*/class Item {
/*4*/  constructor() {
/*5*/    this.price = 2;
/*6*/  }
/*7*/  getPrice() {
/*8*/    return this.price;
/*9*/  }
/*10*/  get price() {
/*11*/    return this.price;
/*12*/  }
/*13*/  increasePriceByOne() {
/*14*/    this.price += 1;
/*15*/  }
/*16*/}
/*17*/function foo() {
/*18*/  var item = new Item();
/*19*/  item.increasePriceByOne();
/*20*/  item.increasePriceByOne();
/*21*/}
/*22*/module.exports = foo;
