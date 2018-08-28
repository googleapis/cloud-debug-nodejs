#!/usr/bin/env bash

# Usage: -c to report coverage

# Enable assertions
export CLOUD_DEBUG_ASSERTIONS=1

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

# Get test/coverage command
counter=0
function run {
  C="$(npm bin)/istanbul test"
  if [ "$cover" ]; then
    C="$(npm bin)/istanbul cover --dir ./coverage/${counter}"
    ((counter++))
  fi
  ($C "$(npm bin)/_mocha" -- $* --require source-map-support/register --timeout 4000 --R spec) || exit 1
}

# Run test/coverage
run build/test

# Conditionally publish coverage
if [ "$cover" ]; then
  $(npm bin)/istanbul report lcovonly
  ./node_modules/coveralls/bin/coveralls.js < ./coverage/lcov.info
  rm -rf ./coverage
fi

