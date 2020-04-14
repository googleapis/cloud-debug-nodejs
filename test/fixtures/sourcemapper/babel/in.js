// arrow functions
// eslint-disable-next-line no-unused-vars
const f = (x, y, z) => {
  const a = x + 1;
  const b = y - 1;
  const c = z * 2;
  const result = a + 2 * b - c;

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

// eslint-disable-next-line no-unused-vars
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
const someOb = {
  // short for someOb : someOb
  someOb,

  // dynamic property names
  ['property' + (1 + 41)]: 42,
};

// template strings
const animal = 'cat';
const hobby = 'sleep';
console.log(`The ${animal} likes to ${hobby}`);

// destructuring
// eslint-disable-next-line no-unused-vars
const [x, y, z] = [1, 2, 3];

// default values
function someFunction(x, y = 32) {
  return x + y;
}

console.log(someFunction(10) === 42);

// rest and spread
function varArgsFunction(x, ...y) {
  return x + y.length;
}

console.log(varArgsFunction(10, 1, 2, 3, 4, 5) === 15);
console.log(varArgsFunction(...[10, 1, 2, 3, 4, 5]) === 15);

// let and const
const SOME_VALUE = 10;
for (let i = 0; i < 10; i++) {
  console.log(SOME_VALUE + i);
}

/*
 * Copyright 2016 Google Inc. All Rights Reserved.
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
