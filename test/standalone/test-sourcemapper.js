/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var assert = require('assert');
var proxyquire = require('proxyquire');

/**
 * @param {string} tool The name of the tool that was used to generate the 
 *  given sourcemap data
 * @param {Object} The sourcemap data conforming to the sourcemap
 *  specification.
 * 
 *  The object must:
 *    * have an array containing one string referenced by the 'sources'
 *      attribute, which is the name of the input source file
 *    * have a string referenced by the 'file' attribute that specifies
 *      the corresponding output file
 *    * have a 'mappings' attribute conforming to the sourcemap specification
 * @param {Array.<Array.<number, number>>} inToOutLineNums An array of arrays
 *  where each element in the array is a pair of numbers.  The first number
 *  in the pair is the line number from the input file and the second number
 *  in the pair is the expected line number in the corresponding output file.
 * 
 *  Note: The line numbers are zero-based
 */
function testTool(tool, sourcemapData, inToOutLineNums) {
  var Sourcemapper = proxyquire('../../lib/sourcemapper.js', {
    fs: {
      readFile: function(path, encoding, cb){
        cb(null, sourcemapData);
      }
    }
  });

  describe('sourcemapper for tool ' + tool, function() {
    var inputFilePath = sourcemapData.sources[0],
        outputFilePath = sourcemapData.file,
        mapFilePath = outputFilePath + '.map';
    var mockLogger = {
      error: function() {}
    };
    var mapper;

    beforeEach(function(done) {
      mapper = new Sourcemapper([mapFilePath], mockLogger);
      done();
    });

    it('for tool ' + tool +
       ' it states that it has mapping info for files it knows about',
      function(done) {
        assert.equal(mapper.hasMappingInfo(inputFilePath), true);
        done();
    });

    it('for tool ' + tool + 
       ' it states that it does not have mapping info for a file it ' +
       'doesn\'t recognize',
      function(done) {
        assert.equal(mapper.hasMappingInfo('INVALID_' + inputFilePath), false);
        done();
    });

    var testLineMapping = function(inputLine, expectedOutputLine) {
      var info = mapper.mappingInfo(inputFilePath, inputLine, 0);
      assert.equal(info.file, outputFilePath);
      assert.equal(info.line, expectedOutputLine,
        ' invalid mapping for input line ' + inputLine);
    };

    it('for tool ' + tool + ' it properly maps line numbers',
      function(done) {
        inToOutLineNums.forEach(function(inToOutPair) {
          testLineMapping(inToOutPair[0], inToOutPair[1]);
        });

        done();
    });
  });
}

// see the comments below for details on the code and tool used to 
// generate this sourcemap
var BABEL_SOURCEMAP = {
  'version': 3,
  'sources': [
    'in.js'
  ],
  'names': [],
  'mappings': ';;;;;;;;;;;;;;AACA;AACA,IAAI,IAAI,SAAJ,CAAI,CAAC,CAAD,EAAI,'+
    'CAAJ,EAAO,CAAP,EAAa;AACnB,MAAI,IAAI,IAAI,CAAZ;AACA,MAAI,IAAI,IAAI,CAAZ;'+
    'AACA,MAAI,IAAI,IAAI,CAAZ;AACA,MAAI,SAAS,IAAI,IAAE,CAAN,GAAU,CAAvB;;'+
    'AAEA,SAAO,MAAP;AACD,CAPD;;AASA;;IACM,O;AACJ,mBAAY,CAAZ,EAAe,CAAf,EAAkB;'+
    'AAAA;;AAChB,SAAK,CAAL,GAAS,CAAT;AACA,SAAK,CAAL,GAAS,CAAT;AACD;;;;8BAES,'+
    'C,EAAG,C,EAAG;AACd,WAAK,CAAL,IAAU,CAAV;AACA,WAAK,CAAL,IAAU,CAAV;AACD;;;'+
    '6BAEe;AACd,aAAO,IAAI,OAAJ,CAAY,CAAZ,EAAe,CAAf,CAAP;AACD;;;;;;IAGG,O;;;'+
    'AACJ,mBAAY,CAAZ,EAAe,CAAf,EAAkB,CAAlB,EAAqB;AAAA;;AAAA,kHACb,CADa,EACV,'+
    'CADU;;AAEnB,UAAK,CAAL,GAAS,CAAT;AAFmB;AAGpB;;;;8BAES,C,EAAG,C,EAAG,C,'+
    'EAAG;AACjB,kHAAgB,CAAhB,EAAmB,CAAnB;AACA,WAAK,CAAL,IAAU,CAAV;AACD;;;'+
    '6BAEe;AACd,aAAO,IAAI,OAAJ,CAAY,CAAZ,EAAe,CAAf,EAAkB,CAAlB,CAAP;AACD;;;;'+
    'EAbmB,O;;AAgBtB;;;AACA,IAAI;AACF;AACA;;AAFE,GAKD,cAAc,IAAI,EAAlB,CALC,'+
    'EAKwB,EALxB,CAAJ;;AAQA;AACA,IAAI,SAAS,KAAb;AACA,IAAI,QAAQ,OAAZ;AACA,'+
    'QAAQ,GAAR,UAAmB,MAAnB,kBAAsC,KAAtC;;AAEA;IACK,C,GAAY,C;IAAT,C,GAAY,C;'+
    'IAAT,C,GAAY,C;;AAEvB;;AACA,SAAS,YAAT,CAAsB,CAAtB,EAA8B;AAAA,MAAL,CAAK,'+
    'uEAAH,EAAG;;AAC5B,SAAO,IAAI,CAAX;AACD;;AAED,QAAQ,GAAR,CAAY,aAAa,EAAb,'+
    'MAAqB,EAAjC;;AAEA;AACA,SAAS,eAAT,CAAyB,CAAzB,EAAkC;AAChC,SAAO,sDAAP;'+
    'AACD;;AAED,QAAQ,GAAR,CAAY,gBAAgB,EAAhB,EAAoB,CAApB,EAAuB,CAAvB,EAA0B,'+
    'CAA1B,EAA8B,CAA9B,EAAiC,CAAjC,MAAwC,EAApD;AACA,QAAQ,GAAR,CAAY,iCAAmB,'+
    'CAAC,EAAD,EAAK,CAAL,EAAQ,CAAR,EAAW,CAAX,EAAc,CAAd,EAAiB,CAAjB,CAAnB,'+
    'MAA4C,EAAxD;;AAEA;AACA,IAAM,aAAa,EAAnB;AACA,KAAK,IAAI,IAAE,CAAX,EAAc,'+
    'IAAE,EAAhB,EAAoB,GAApB,EAAwB;AACtB,UAAQ,GAAR,CAAY,aAAa,CAAzB;AACD',
  'file': 'out.js'
};

testTool('Babel', BABEL_SOURCEMAP, [
  [1, 14],
  [2, 15],
  [3, 16],
  [4, 17],
  [5, 18],
  [6, 19],
  [8, 21],
  [9, 22],
  [11, 24],
  [12, 26],
  [13, 27],
  [14, 30],
  [15, 31],
  [16, 32],
  [18, 36],
  [19, 37],
  [20, 38],
  [21, 39],
  [23, 42],
  [24, 43],
  [25, 44],
  [28, 50],
  [29, 53],
  [30, 56],
  [31, 58],
  [32, 60],
  [34, 64],
  [35, 65],
  [36, 66],
  [37, 67],
  [39, 70],
  [40, 71],
  [44, 78],
  [45, 81],
  [47, 83],
  [50, 85],
  [54, 88],
  [55, 89],
  [56, 90],
  [59, 93],
  [62, 99],
  [63, 102],
  [66, 105],
  [69, 108],
  [70, 109],
  [73, 112],
  [74, 113],
  [77, 116],
  [78, 117],
  [79, 118]
]);

// see the comments below for details on the code and tool used to 
// generate this sourcemap
var TYPESCRIPT_SOURCEMAP = {
  'version': 3,
  'file': 'out.js',
  'sourceRoot': '',
  'sources': [
    'in.ts'
  ],
  'names':[],
  'mappings': ';;;;;AACA;IACE,gBAAmB,IAAY,EAAS,KAAa;QAAlC,SAAI,GAAJ,IAAI,'+
    'CAAQ;QAAS,UAAK,GAAL,KAAK,CAAQ;QACnD,IAAI,CAAC,IAAI,GAAG,IAAI,CAAC;'+
    'QACjB,IAAI,CAAC,KAAK,GAAG,KAAK,CAAC;IACrB,CAAC;IAED,sBAAK,GAAL;QACE,'+
    'MAAM,CAAC,MAAM,GAAG,IAAI,CAAC,IAAI,GAAG,QAAQ,GAAG,IAAI,CAAC,KAAK,CAAC;'+
    'IACpD,CAAC;IACH,aAAC;AAAD,CAAC,AATD,IASC;AAED;IAAmB,wBAAM;IACvB;QACE,'+
    'kBAAM,MAAM,EAAE,MAAM,CAAC,CAAC;IACxB,CAAC;IACH,WAAC;AAAD,CAAC,AAJD,'+
    'CAAmB,MAAM,GAIxB;AAED,eAAe,IAAY;IACzB,MAAM,CAAC,QAAQ,GAAG,IAAI,CAAC;'+
    'AACzB,CAAC;AAED,KAAK,CAAC,KAAK,CAAC,CAAC;AACb,IAAI,IAAI,EAAE,CAAC,'+
    'KAAK,EAAE,CAAC'
};

testTool('Typescript', TYPESCRIPT_SOURCEMAP, [
  [1, 5],
  [2, 6],
  [3, 9],
  [4, 10],
  [7, 12],
  [8, 13],
  [12, 17],
  [13, 19],
  [14, 20],
  [18, 24],
  [19, 25],
  [22, 27],
  [23, 28]
]);

// see the comments below for details on the code and tool used to 
// generate this sourcemap
var COFFEESCRIPT_SOURCEMAP = {
  'version': 3,
  'file': 'in.js',
  'sourceRoot': '',
  'sources': [
    'in.coffee'
  ],
  'names': [],
  'mappings': ';AACA;AAAA,MAAA,iDAAA;IAAA;;;EAAM;IACS,gBAAC,IAAD,EAAO,KAAP;'+
    'MACX,IAAC,CAAA,IAAD,GAAQ;MACR,IAAC,CAAA,KAAD,GAAS;IAFE;;qBAIb,KAAA,GAAO,'+
    'SAAA;AACL,aAAO,MAAA,GAAS,IAAT,GAAgB,QAAhB,GAA2B;IAD7B;;;;;;EAGH;;;IACS,'+
    'cAAA;MACX,sCAAM,MAAN,EAAc,MAAd;IADW;;;;KADI;;EAInB,MAAA,GACE;IAAA,CAAA,'+
    'EAAI,GAAJ;IACA,CAAA,EAAI,GADJ;;;EAGF,OAAO,CAAC,GAAR,CAAY,IAAI,IAAA,CAAA,'+
    'CAAM,CAAC,KAAvB;;EAEA,IAAA,GAAO,CAAC,CAAD,EAAI,CAAJ,EAAO,CAAP,EAAU,CAAV,'+
    'EAAa,CAAb;;EACP,MAAA,GAAS,SAAC,CAAD;WAAO,CAAA,GAAE;EAAT;;EACT,UAAA;;'+
    'AAAc;SAAA,sCAAA;;mBAAA,MAAA,CAAO,CAAP;AAAA;;;AApBd'
};

testTool('Coffeescript', COFFEESCRIPT_SOURCEMAP, [
  [1, 1],
  [2, 7],
  [3, 8],
  [4, 9],
  [6, 12],
  [7, 13],
  [9, 20],
  [10, 23],
  [11, 24],
  [13, 31],
//  [14, 32],
  [15, 33],
  [17, 36],
  [19, 38],
  [20, 40],
  [21, 44]
]);

// ---------------------- supplemental information ------------------------

/*
 * The following is the Javascript code from which the above sourcemap data 
 * was generated using the command 
 *    babel --presets es2015,stage-2 -o out.js -s true in.js
 * using Babel 6.14.0 (babel-core 6.14.0) with dependencies
 *    babel-preset-es2015 version 6.16.0
 *    babel-preset-stage-2 version 6.17.0
-----=[ begin code ]=-----

// arrow functions
var f = (x, y, z) => {
  var a = x + 1;
  var b = y - 1;
  var c = z * 2;
  var result = a + 2*b - c;

  return result;
};

// classes
class Point2D {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  translate(x, y) {
    this.x += x;
    this.y += y;
  }

  static origin() {
    return new Point2D(0, 0);
  }
}

class Point3D extends Point2D {
  constructor(x, y, z) {
    super(x, y);
    this.z = z;
  }

  translate(x, y, z) {
    super.translate(x, y);
    this.z += z;
  }

  static origin() {
    return new Point3D(0, 0, 0);
  }
}

// enhanced object literals
var someOb = {
  // short for someOb : someOb
  someOb,

  // dynamic property names
  ["property" + (1 + 41)] : 42
}

// template strings
var animal = 'cat';
var hobby = 'sleep';
console.log(`The ${animal} likes to ${hobby}`);

// destructuring
var [x, y, z] = [1, 2, 3];

// default values
function someFunction(x, y=32){
  return x + y;
}

console.log(someFunction(10) === 42);

// rest and spread
function varArgsFunction(x, ...y) {
  return x + y.length;
}

console.log(varArgsFunction(10, 1, 2, 3 , 4, 5) === 15);
console.log(varArgsFunction(...[10, 1, 2, 3, 4, 5]) === 15);

// let and const
const SOME_VALUE = 10;
for (let i=0; i<10; i++){
  console.log(SOME_VALUE + i);
}
-----=[ end code ]=-----
 */

/*
 * The following is the Typescript code from which the above sourcemap data 
 * was generated using the command
 *    tsc --sourceMap --outFile out.js in.ts
 * using Typescript Version 2.0.3
-----=[ start code ]=-----

class Animal {
  constructor(public name: string, public sound: string){
    this.name = name;
    this.sound = sound;
  }

  hello() {
    return "The " + this.name + " says " + this.sound;
  }
}

class Lion extends Animal {
  constructor(){
    super('Lion', 'roar');
  }
}

function hello(name: string){
  return 'Hello ' + name;
}

hello('you');
new Lion().hello();
-----=[ end code ]=-----
 */


/*
 * The following is the Coffeescript code from which the abvoe sourcemap data 
 * was generated using the command 
 *    coffee --map --output . in.coffee
 * using CoffeeScript version 1.11.0.
-----=[ start code ]=-----

class Animal
  constructor: (name, sound) ->
    @name = name
    @sound = sound

  hello: () ->
    return 'The ' + name + ' says ' + sound

class Lion extends Animal
  constructor: () ->
    super('Lion', 'roar')

someOb =
  a : 'a',
  b : 'b'

console.log new Lion().alert

nums = [1, 2, 3, 4, 5]
square = (x) -> x*x;
allSquares = (square x for x in nums)

-----=[ end code ]=-----
 */