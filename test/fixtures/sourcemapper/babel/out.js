'use strict';

const _get = function get(object, property, receiver) {
  if (object === null) object = Function.prototype;
  const desc = Object.getOwnPropertyDescriptor(object, property);
  if (desc === undefined) {
    const parent = Object.getPrototypeOf(object);
    if (parent === null) {
      return undefined;
    } else {
      return get(parent, property, receiver);
    }
  } else if ('value' in desc) {
    return desc.value;
  } else {
    const getter = desc.get;
    if (getter === undefined) {
      return undefined;
    }
    return getter.call(receiver);
  }
};

const _createClass = (function () {
  function defineProperties(target, props) {
    for (let i = 0; i < props.length; i++) {
      const descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ('value' in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }
  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
})();

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

function _possibleConstructorReturn(self, call) {
  if (!self) {
    throw new ReferenceError(
      "this hasn't been initialised - super() hasn't been called"
    );
  }
  return call && (typeof call === 'object' || typeof call === 'function')
    ? call
    : self;
}

function _inherits(subClass, superClass) {
  if (typeof superClass !== 'function' && superClass !== null) {
    throw new TypeError(
      'Super expression must either be null or a function, not ' +
        typeof superClass
    );
  }
  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
  if (superClass)
    Object.setPrototypeOf
      ? Object.setPrototypeOf(subClass, superClass)
      : (subClass.__proto__ = superClass);
}

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError('Cannot call a class as a function');
  }
}

// arrow functions
// eslint-disable-next-line no-unused-vars
const f = function f(x, y, z) {
  const a = x + 1;
  const b = y - 1;
  const c = z * 2;
  const result = a + 2 * b - c;

  return result;
};

// classes

const Point2D = (function () {
  function Point2D(x, y) {
    _classCallCheck(this, Point2D);

    this.x = x;
    this.y = y;
  }

  _createClass(
    Point2D,
    [
      {
        key: 'translate',
        value: function translate(x, y) {
          this.x += x;
          this.y += y;
        },
      },
    ],
    [
      {
        key: 'origin',
        value: function origin() {
          return new Point2D(0, 0);
        },
      },
    ]
  );

  return Point2D;
})();

// eslint-disable-next-line no-unused-vars
const Point3D = (function (_Point2D) {
  _inherits(Point3D, _Point2D);

  function Point3D(x, y, z) {
    _classCallCheck(this, Point3D);

    const _this = _possibleConstructorReturn(
      this,
      (Point3D.__proto__ || Object.getPrototypeOf(Point3D)).call(this, x, y)
    );

    _this.z = z;
    return _this;
  }

  _createClass(
    Point3D,
    [
      {
        key: 'translate',
        value: function translate(x, y, z) {
          _get(
            Point3D.prototype.__proto__ ||
              Object.getPrototypeOf(Point3D.prototype),
            'translate',
            this
          ).call(this, x, y);
          this.z += z;
        },
      },
    ],
    [
      {
        key: 'origin',
        value: function origin() {
          return new Point3D(0, 0, 0);
        },
      },
    ]
  );

  return Point3D;
})(Point2D);

// enhanced object literals

const someOb = _defineProperty(
  {
    // short for someOb : someOb
    someOb: someOb,
  },
  'property' + (1 + 41),
  42
);

// template strings
const animal = 'cat';
const hobby = 'sleep';
console.log('The ' + animal + ' likes to ' + hobby);

// destructuring
/* eslint-disable no-unused-vars */
const x = 1;
const y = 2;
const z = 3;
/* eslint-enable no-unused-vars */

// default values

function someFunction(x) {
  const y =
    arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 32;

  return x + y;
}

console.log(someFunction(10) === 42);

// rest and spread
function varArgsFunction(x) {
  return x + (arguments.length <= 1 ? 0 : arguments.length - 1);
}

console.log(varArgsFunction(10, 1, 2, 3, 4, 5) === 15);
console.log(varArgsFunction.apply(undefined, [10, 1, 2, 3, 4, 5]) === 15);

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

//# sourceMappingURL=out.js.map
