const spawn = require('child_process').spawn;
var path = require('path');
var semver = require('semver');

process.env.GCLOUD_PROJECT = 0
process.env.CLOUD_DEBUG_ASSERTIONS = 1
spawn('node_modules/.bin/mocha',
  [ path.join('build', 'test'), '--timeout 4000', '--R' ], {
  stdio : 'inherit'
}).on('close', function() {
  if (semver.satisfies(process.version, '>=8')) {
    process.env.GCLOUD_USE_INSPECTOR = true;
    console.log('Run test with Inspector');
    spawn('node_modules/.bin/mocha',
      [ path.join('build', 'test'), '--timeout 4000', '--R' ], {
      stdio : 'inherit'
    });
  }
});
