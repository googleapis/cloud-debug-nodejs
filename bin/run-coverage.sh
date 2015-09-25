#!/bin/bash

istanbul cover $(npm bin)/_mocha --report lcovonly -- test --timeout 4000 --R spec
cat ./coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js
rm -rf ./coverage
