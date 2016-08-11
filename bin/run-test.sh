#!/usr/bin/env bash

# Usage: -c to report coverage

while true; do
  case $1 in
    -c)
      cover=1
      ;;

    *)
      break
  esac

  shift
done

# Lint
$(npm bin)/jshint . || exit 1

# Get test/coverage command
counter=0
function run {
  C="$(npm bin)/istanbul test"
  if [ "$cover" ]; then
    C="$(npm bin)/istanbul cover --dir ./coverage/${counter}"
    ((counter++))
  fi
  ($C "$(npm bin)/_mocha" -- $* --timeout 15000 --R spec) || exit 1
}

# Run test/coverage
run test
for test in test/standalone/test-*.js ;
do
  run "${test}"
done

# Conditionally publish coverage
if [ "$cover" ]; then
  $(npm bin)/istanbul report lcovonly
  ./node_modules/coveralls/bin/coveralls.js < ./coverage/lcov.info
  rm -rf ./coverage
fi

if [ "${TRAVIS_PULL_REQUEST}" = "false" ]
then
  ./bin/run-e2e.sh || exit 1
fi
