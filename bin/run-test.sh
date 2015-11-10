#!/usr/bin/env bash

# Usage: -c to report coverage

while true; do
  case $1 in
    -c)
      cover=1
      ;;

    --e2e)
      e2e=1
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
  ($C "$(npm bin)/_mocha" -- $* --timeout 4000 --R spec) || exit 1
}

# Run test/coverage
run test
for test in test/standalone/test-*.js ;
do
  run "${test}"
done

# Conditionally publish coverage
if [ "$cover" ]; then
  istanbul report lcovonly
  ./node_modules/coveralls/bin/coveralls.js < ./coverage/lcov.info
  rm -rf ./coverage
fi

if [ "${TRAVIS_PULL_REQUEST}" = "false" -a ! -z "${e2e}" ]; then
  cd test/e2e

  echo -en "travis_fold:start:npm_install_test_e2e\\r" | tr / _
  echo "npm install in test/e2e"
  npm install || exit 1
  echo -en "travis_fold:end:npm_install_test_e2e\\r" | tr / _

  # Need a key file and GCLOUD_PROJECT_NUM defined for the following to succeed.
  node test.js

  cd -
fi
