#!/bin/bash

jshint . || exit 1
istanbul test $(npm bin)/_mocha -- test --timeout 4000 --R spec || exit 1
