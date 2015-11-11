# Node.js agent for Google Cloud Debug

[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]


## Overview

*This module is experimental, and should be used by early adopters. This module uses APIs there may be undocumented and may be subject to change without notice.*

The Cloud Debugger is a feature of the Google Cloud Platform that lets you inspect the state of your application at any code location without stopping your application. For more information about the Cloud Debugger, see https://cloud.google.com/tools/cloud-debugger/. Here's an introductory video:

[![Cloud Debugger Intro](http://img.youtube.com/vi/tyHcK_kAOpw/0.jpg)](https://www.youtube.com/watch?v=tyHcK_kAOpw)

## Prerequisites
* You are using Node.js 0.12+ for your application. (Node.js v5+ is recommended).
* The source of your application is uploaded to your cloud project's [source repository](https://cloud.google.com/tools/cloud-repositories/docs/). The Debugger UI needs the source to be available in order to set breakpoints.

## Quick Start (Node.js v4.x+)
```shell
# Install module, and save it as a dependency
npm install --save @google/cloud-debug

# Change the start command of your application in package.json
   ...
   "scripts" {
     "start": "node --require @google/cloud-debug server.js"
   ...
```
Navigate to the Debug tab within the [Google Developers Console][dev-console] to set breakpoints and start debugging.

## Detailed instructions

1. Install the debug agent module.

   ```shell
   npm install --save @google/cloud-debug
   ```
1. Ensure that the module gets loaded during your application's startup. The best way to do this is via the `--require` command line option available in Node.js v4. You should add this option to the startup script section in your `package.json`.

   ```
   "scripts": {
      "start": "node --require @google/cloud-debug server.js",
   ```
   If you are using Node.js v0.12.x, you will not be able to use the `--require` command line option. Instead you will have to manually load the debug agent module in the startup script of your application. For example, you may want to add the following
   to your `server.js`:
   ```javascript
   require('@google/cloud-debug');
   ```

At this point you can deploy your application to AppEngine or to Google Compute Engine and the debug agent will activate with no further action. If you want to run your application locally, you can still use the cloud debug agent, with a few additional steps:

1. The agent needs to know the numeric project id of your Google cloud project. You can obtain this information from the project's settings page in the Google Developers Console (click on the gear icon in the corner.)

  ```shell
  export GCLOUD_PROJECT_NUM=<your numeric project id>
  ```
1. You need to provide credentials to authenticate to the Cloud Debugger API. If you are using the [`gcloud` command line tools][gcloud-sdk] already, and are already logged in using `gcloud auth login`, you already have sufficient credentials, and no further action is required.
1. Alternatively, if are NOT using `gcloud auth login` on the machine where you will running your app, you can use service account credentials. To create a service account:
  1. Visit the [Google Developers Console][dev-console].
  2. Create a new project or click on an existing project.
  3. Navigate to **APIs & auth** >  **Credentials** and then:
    * If you want to use a new service account, click on **Create new Client ID** and select **Service account**. After the account is created, you will be prompted to download the JSON key file that the library uses to authenticate your requests.
    * If you want to generate a new key for an existing service account, click on **Generate new JSON key** and download the JSON key file.

### Debug UI

Once your application is running (deployed, or elsewhere), you should be able to use the Debug UI in your Cloud [developer console][dev-console]. You can find the Debug UI in the 'Operations > Debug' section in the navigation panel, or by simply searching for 'Debug' in the developer console.

![Debug UI](doc/images/debug-ui.png?raw=true)

You can browse the code, and set a snapshot by clicking in the gutter (line number area). Once you set a snapshot, the debug agent will insert a momentary breakpoint at the code location in the running instances of the application.

![Breakpoint Set](doc/images/breakpoint-set.png?raw=true)

As soon as that line of code is reached in any of the running instances of your application, the stack traces, local variables, and watch expressions are captured, and your application continues.

![Breakpoint Hit](doc/images/breakpoint-hit.png?raw=true)

## Limitations and Requirements
* The root directory of your application needs to contain a `package.json` file.
* You can set breakpoint conditions and watch expressions to be evaluated in the context of your application. This leads to some issues you should be aware of
  * You may be able to view sensitive data of your own users by looking at the values of the variables.
  * The debug agent tries to ensure that all conditions and watchpoints you add are read-only and have no side effects. It catches, and disallows, all expressions that may have static side effects to prevent accidental state change. However, it presently does not catch expressions that have dynamic side-effects. For example, `o.f` looks like a property access, but dynamically, it may end up calling a getter function. We presently do NOT detect such dynamic-side effects.
* With Node.js 4.x and older, your application may experience a performance impact when there are breakpoint active. There should be no impact to performance when no breakpoints are active. Node.js v5.x does not have this issue.
* Node.js v0.10.x or older are not supported as they lack some necessary APIs to avoid a permanent (life of the application) performance hit.


[cloud-debugger]: https://cloud.google.com/tools/cloud-debugger/
[dev-console]: https://console.developers.google.com/
[gcloud-sdk]: https://cloud.google.com/sdk/gcloud/
[npm-image]: https://img.shields.io/npm/v/@google/cloud-debug.svg
[npm-url]: https://npmjs.org/package/@google/cloud-debug
[travis-image]: https://travis-ci.org/GoogleCloudPlatform/cloud-debug-nodejs.svg?branch=master
[travis-url]: https://travis-ci.org/GoogleCloudPlatform/cloud-debug-nodejs
[coveralls-image]: https://img.shields.io/coveralls/GoogleCloudPlatform/cloud-debug-nodejs/master.svg
[coveralls-url]: https://coveralls.io/r/GoogleCloudPlatform/cloud-debug-nodejs?branch=master
[david-image]: https://david-dm.org/GoogleCloudPlatform/cloud-debug-nodejs.svg
[david-url]: https://david-dm.org/GoogleCloudPlatform/cloud-debug-nodejs
[david-dev-image]: https://david-dm.org/GoogleCloudPlatform/cloud-debug-nodejs/dev-status.svg
[david-dev-url]: https://david-dm.org/GoogleCloudPlatform/cloud-debug-nodejs#info=devDependencies
