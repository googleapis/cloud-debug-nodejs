var Mocha = require('mocha')
var fs = require('fs');
var path = require('path');
var semver = require('semver');


var mocha = new Mocha();
var testDir = 'build/test';
fs.readdirSync(testDir).filter(function(file) {
    return file.substr(-3) === '.js';
}).forEach(function(file) {
    mocha.addFile(
        path.join(testDir, file)
    );
});

process.env.GCLOUD_PROJECT = 0
process.env.CLOUD_DEBUG_ASSERTIONS = 1

const nodeVersion = /v(\d+\.\d+\.\d+)/.exec(process.version);
if (!nodeVersion || nodeVersion.length < 2) {
  console.error('unable to get node version');
} else if (semver.satisfies(nodeVersion[1], '>=8')) {
  console.log('Run test with Inspector');
  process.env.GCLOUD_USE_INSPECTOR = true;
  mocha.run(function(failures) {
    process.on('exit', function () {
        process.exit(failures);
    });
  });
}
