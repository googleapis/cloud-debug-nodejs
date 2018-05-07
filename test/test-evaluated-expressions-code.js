/* 1* KEEP THIS CODE AT THE TOP TO AVOID LINE NUMBER CHANGES */ /* jshint shadow:true */
/* 2*/'use strict';
/* 3*/const nock = require('nock');
/* 4*/const http = require('http');
/* 5*/function foo() {
/* 6*/  nock.disableNetConnect();
/* 7*/  const scope = nock('http://www.someinvalidsite.com')
/* 8*/                .get('/some/missing/path')
/* 9*/                .once()
/*10*/                .reply(200);
/*11*/ const options = {
/*12*/    host: 'www.someinvalidsite.com',
/*13*/    path: '/some/missing/path'
/*14*/  };
/*15*/  http.request(options, res => {
/*16*/    const someObject = { aNumber: 1, aString : 'some string' };
/*17*/    const someArray = [1, 2, 3];
/*18*/    const someRegex = /abc+/;
/*19*/    scope.done();
/*20*/  }).end();
/*21*/}
/*22*/module.exports = {
/*23*/  foo: foo
/*24*/};