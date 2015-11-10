#!/usr/bin/env bash

set -e

cd test/e2e

if [ "${TRAVIS_PULL_REQUEST}" = "false" ]; then
  openssl aes-256-cbc -K $encrypted_a8f6bb4bf8ae_key \
    -iv $encrypted_a8f6bb4bf8ae_iv \
    -in ../../node-team-debug-test-a03aecc1d97a.json.enc \
    -out node-team-debug-test-a03aecc1d97a.json -d
fi

echo -en "travis_fold:start:npm_install_test_e2e\\r" | tr / _
echo "npm install in test/e2e"
npm install
echo -en "travis_fold:end:npm_install_test_e2e\\r" | tr / _

node test.js

cd -
