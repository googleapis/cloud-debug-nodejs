# Node.js agent for Google Cloud Debug

[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]

> *This module is experimental, and should be used by early adopters. This module uses APIs there may be undocumented and may be subject to change without notice.*

This module provides Cloud Debug support for Node.js applications. [Google Cloud Debug](https://cloud.google.com/tools/cloud-debugger/) is a feature of [Google Cloud Platform](https://cloud.google.com/) that lets you debug your applications in production without stopping or pausing your application. Here's an introductory video:

[![Cloud Debugger Intro](http://img.youtube.com/vi/tyHcK_kAOpw/0.jpg)](https://www.youtube.com/watch?v=tyHcK_kAOpw)

## Prerequisites
* Your application will need to be using Node.js version 0.12 or greater. Node.js v5+ is recommended.
* The source of your application is uploaded to a [cloud source repository](https://cloud.google.com/tools/cloud-repositories/docs/). The Debugger UI needs the source to be available in order to set breakpoints.

## Quick Start (Node.js v4.x+)
```shell
# Install with `npm` or add to your `package.json`.
npm install --save @google/cloud-debug

# Require the agent at the top of your main script.
require('@google/cloud-debug');
```
Deploy your application, and navigate to the [Debug tab][debug-tab] within the [Google Developers Console][dev-console] to set breakpoints and start debugging.

## Running on Google Cloud Platform

There are three different services that can host Node.js application to Google Cloud Platform.

### Google App Engine Managed VMs

If you are using [Google App Engine Managed VMs](https://cloud.google.com/appengine/docs/managed-vms/), you do not have to do any additional configuration.

### Google Compute Engine

Your VM instances need to be created with `cloud-platform` scope if created via [gcloud](https://cloud.google.com/sdk) or the 'Allow API access' checkbox selected if created via the [console](https://console.developers.google.com) (see screenshot).

![GCE API](doc/images/gce.png?raw=true)

If you already have VMs that were created without API access and do not wish to recreate it, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere).

### Google Container Engine

Container Engine nodes need to also be created with the `cloud-platform` scope, which is configurable during cluster creation. Alternatively, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere). It's recommended that you store the service account credentials as [Kubernetes Secret](http://kubernetes.io/v1.1/docs/user-guide/secrets.html).

## Running elsewhere

If your application is running outside of Google Cloud Platform, such as locally, on-premise, or on another cloud provider, you can still use Cloud Debug.

1. You will need to specify your project name. Your project name is visible in the [Google Cloud Console][cloud-console-projects], it may be something like `particular-future-12345`. If your application is [running on Google Cloud Platform](running-on-google-cloud-platform), you don't need to specify the project name.

        export GCLOUD_PROJECT=<project name>

2. You need to provide service account credentials to your application. The recommended way is via [Application Default Credentials][app-default-credentials].

  1. [Create a new JSON service account key][service-account].
  2. Copy the key somewhere your application can access it. Be sure not to expose the key publicly.
  3. Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to the full path to the key. The debug agent will automatically look for this environment variable.

3. Alternatively, if you are running your application on a machine where your are using the [`gcloud` command line tools][gcloud-sdk], and are logged using `gcloud auth login`, you already have sufficient credentials, and a service account key is not required.

4. Generate a `source-context.json` file which contains information about the version of the source code used to build the application. This file should be located in the root directory of your application. When you open the Stackdriver Debugger in the Cloud Platform Console, it uses the information in this file to display the correct version of the source.

        gcloud preview app gen-repo-info-file

## Using the Debugger

Once your application is running (deployed, or elsewhere), you should be able to use the [Debug UI][debug-tab] in your Cloud [developer console][dev-console]. You can find the Debug UI in the 'STACKDRIVER -> Debug' section in the navigation panel, or by simply searching for 'Debug' in the developer console.

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
[dev-console]: https://console.cloud.google.com/
[debug-tab]: https://console.developers.google.com/debug
[gcloud-sdk]: https://cloud.google.com/sdk/gcloud/
[cloud-console-projects]: https://console.cloud.google.com/iam-admin/projects
[app-default-credentials]: https://developers.google.com/identity/protocols/application-default-credentials
[service-account]: https://console.developers.google.com/apis/credentials/serviceaccountkey
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
