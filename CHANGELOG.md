# Node.js Agent for Google Cloud Debug ChangeLog

### [5.2.5](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.2.4...v5.2.5) (2021-06-24)


### Bug Fixes

* Add debugging information for sourcemapper ([#977](https://www.github.com/googleapis/cloud-debug-nodejs/issues/977)) ([b647106](https://www.github.com/googleapis/cloud-debug-nodejs/commit/b6471062a24894c7a427ad29ece0819b3b383352))
* source mapping original path instead of user-provided input ([#978](https://www.github.com/googleapis/cloud-debug-nodejs/issues/978)) ([108225c](https://www.github.com/googleapis/cloud-debug-nodejs/commit/108225cfadbef2c6b3b0c4f4be06a8ea983a0476))

### [5.2.4](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.2.3...v5.2.4) (2021-06-17)


### Bug Fixes

* attach to v8 debugger session only when having active breakpoints ([#975](https://www.github.com/googleapis/cloud-debug-nodejs/issues/975)) ([031a7ad](https://www.github.com/googleapis/cloud-debug-nodejs/commit/031a7ad5c830beee318ae36a9e56b6588bc929d4))

### [5.2.3](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.2.2...v5.2.3) (2021-06-14)


### Bug Fixes

* surface correct error message for ambiguous sourcemap matches ([#971](https://www.github.com/googleapis/cloud-debug-nodejs/issues/971)) ([d5abfac](https://www.github.com/googleapis/cloud-debug-nodejs/commit/d5abfac3affba586f7fa28d2388a2b1d15942576))

### [5.2.2](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.2.1...v5.2.2) (2021-06-04)


### Bug Fixes

* **deps:** upgrade to source-map 0.7.3 ([#964](https://www.github.com/googleapis/cloud-debug-nodejs/issues/964)) ([828125c](https://www.github.com/googleapis/cloud-debug-nodejs/commit/828125cde6fcfa6c8bb9c318aca4bba4a13aaf6c))

### [5.2.1](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.2.0...v5.2.1) (2021-05-31)


### Bug Fixes

* periodically reset v8 session to prevent memory leak ([#957](https://www.github.com/googleapis/cloud-debug-nodejs/issues/957)) ([7735425](https://www.github.com/googleapis/cloud-debug-nodejs/commit/7735425ee8999c6ab1c30706ddf014315309705c))

## [5.2.0](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.1.3...v5.2.0) (2021-05-04)


### Features

* Add region in Debuggee labels in GCF env ([#951](https://www.github.com/googleapis/cloud-debug-nodejs/issues/951)) ([a88e904](https://www.github.com/googleapis/cloud-debug-nodejs/commit/a88e904b02418546962aa986e0e2e523919a27b7))

### [5.1.3](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.1.2...v5.1.3) (2020-11-03)


### Bug Fixes

* add required parameter to fix build breakage ([#928](https://www.github.com/googleapis/cloud-debug-nodejs/issues/928)) ([1e77a61](https://www.github.com/googleapis/cloud-debug-nodejs/commit/1e77a61516a7630937e288b3a2837fac8e44c5f7))
* **deps:** update dependency acorn to v8 ([#916](https://www.github.com/googleapis/cloud-debug-nodejs/issues/916)) ([2f2c421](https://www.github.com/googleapis/cloud-debug-nodejs/commit/2f2c4216219be8b8fc22c401a2474eae0e619c0e))

### [5.1.2](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.1.1...v5.1.2) (2020-07-09)


### Bug Fixes

* typeo in nodejs .gitattribute ([#904](https://www.github.com/googleapis/cloud-debug-nodejs/issues/904)) ([3f7e99a](https://www.github.com/googleapis/cloud-debug-nodejs/commit/3f7e99a67a26ecee164e3a6881a58a720a8b790c))

### [5.1.1](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.1.0...v5.1.1) (2020-07-07)


### Bug Fixes

* **dep:** update dependency p-limit to v3 ([#902](https://www.github.com/googleapis/cloud-debug-nodejs/issues/902)) ([cf8b0c7](https://www.github.com/googleapis/cloud-debug-nodejs/commit/cf8b0c764376244fb12fbf018f34985575191de8))

## [5.1.0](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v5.0.0...v5.1.0) (2020-06-25)


### Features

* add auto-inferred platform label ([#886](https://www.github.com/googleapis/cloud-debug-nodejs/issues/886)) ([cb1743b](https://www.github.com/googleapis/cloud-debug-nodejs/commit/cb1743bc7058ba9c8e717db6d6ba37bfc27a93a5))
* add support to breakpoint canary ([#883](https://www.github.com/googleapis/cloud-debug-nodejs/issues/883)) ([692d0a7](https://www.github.com/googleapis/cloud-debug-nodejs/commit/692d0a7a2d875cf048dc3b5c5c9a224ddc962e60))

## [5.0.0](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.2.2...v5.0.0) (2020-05-20)


### ⚠ BREAKING CHANGES

* drop support for node.js 8.x (#851)
* require node 10 in engines field (#852)

### Features

* require node 10 in engines field ([#852](https://www.github.com/googleapis/cloud-debug-nodejs/issues/852)) ([01dc0e2](https://www.github.com/googleapis/cloud-debug-nodejs/commit/01dc0e263a57914e7f7320feac950dfedeeb7099))


### Bug Fixes

* **deps:** update dependency @google-cloud/common to v3 ([#853](https://www.github.com/googleapis/cloud-debug-nodejs/issues/853)) ([79bbc9c](https://www.github.com/googleapis/cloud-debug-nodejs/commit/79bbc9c9ad9c763166e6a96ba254c8521d485f12))
* **deps:** update dependency gcp-metadata to v4 ([#844](https://www.github.com/googleapis/cloud-debug-nodejs/issues/844)) ([8b4040e](https://www.github.com/googleapis/cloud-debug-nodejs/commit/8b4040e933676535fb75c135be931c70fc8bad37))
* apache license URL ([#468](https://www.github.com/googleapis/cloud-debug-nodejs/issues/468)) ([#863](https://www.github.com/googleapis/cloud-debug-nodejs/issues/863)) ([87553b2](https://www.github.com/googleapis/cloud-debug-nodejs/commit/87553b267df9e0008584645a80c41ef820c11689))
* reduce set of dependencies ([#876](https://www.github.com/googleapis/cloud-debug-nodejs/issues/876)) ([6c2722e](https://www.github.com/googleapis/cloud-debug-nodejs/commit/6c2722e59bb7113cf7a4bf065434b2be3aff50ca))


### Build System

* drop support for node.js 8.x ([#851](https://www.github.com/googleapis/cloud-debug-nodejs/issues/851)) ([3130ad3](https://www.github.com/googleapis/cloud-debug-nodejs/commit/3130ad320dc69b01d43d8e39d31ce158a13311f1))

### [4.2.2](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.2.1...v4.2.2) (2020-01-23)


### Bug Fixes

* breakpoints work on windows ([#815](https://www.github.com/googleapis/cloud-debug-nodejs/issues/815)) ([8309839](https://www.github.com/googleapis/cloud-debug-nodejs/commit/8309839290985b16d9e7b4586cf7e7db10f7676b)), closes [#795](https://www.github.com/googleapis/cloud-debug-nodejs/issues/795)

### [4.2.1](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.2.0...v4.2.1) (2019-12-15)


### Bug Fixes

* **deps:** pin TypeScript below 3.7.0 ([35589fb](https://www.github.com/googleapis/cloud-debug-nodejs/commit/35589fb467a115fb25c5a2ecf44cfb06cf5b8df4))
* **deps:** update dependency semver to v7 ([#800](https://www.github.com/googleapis/cloud-debug-nodejs/issues/800)) ([70edb78](https://www.github.com/googleapis/cloud-debug-nodejs/commit/70edb7886569067ed3e44a037f2f26277ec6d8b6))

## [4.2.0](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.1.0...v4.2.0) (2019-11-21)


### Features

* improve experience when multiple files match a breakpoint location ([#784](https://www.github.com/googleapis/cloud-debug-nodejs/issues/784)) ([8b50f38](https://www.github.com/googleapis/cloud-debug-nodejs/commit/8b50f387f1376a438cf315adb8a40a01a7ddfced))


### Bug Fixes

* **docs:** add jsdoc-region-tag plugin ([#783](https://www.github.com/googleapis/cloud-debug-nodejs/issues/783)) ([94e7255](https://www.github.com/googleapis/cloud-debug-nodejs/commit/94e72554efe8d62db81f2cbce51551212f07fc79))

## [4.1.0](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.0.4...v4.1.0) (2019-11-08)


### Features

* introduce javascriptFileExtensions config parameter. ([#779](https://www.github.com/googleapis/cloud-debug-nodejs/issues/779)) ([bf79ce8](https://www.github.com/googleapis/cloud-debug-nodejs/commit/bf79ce8d0d3b53a1bfe121672893ad2590472e9f))

### [4.0.4](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.0.3...v4.0.4) (2019-10-02)


### Bug Fixes

* **deps:** update dependency gcp-metadata to v3 ([#757](https://www.github.com/googleapis/cloud-debug-nodejs/issues/757)) ([77d0d93](https://www.github.com/googleapis/cloud-debug-nodejs/commit/77d0d93))

### [4.0.3](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.0.2...v4.0.3) (2019-08-22)


### Bug Fixes

* correct column numbers for line-1 breakpoints ([#751](https://www.github.com/googleapis/cloud-debug-nodejs/issues/751)) ([f6d4f76](https://www.github.com/googleapis/cloud-debug-nodejs/commit/f6d4f76))

### [4.0.2](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.0.1...v4.0.2) (2019-08-21)


### Bug Fixes

* allow calls with no request, add JSON proto ([bb1bcc9](https://www.github.com/googleapis/cloud-debug-nodejs/commit/bb1bcc9))
* warn if maxDataSize=0 ([#744](https://www.github.com/googleapis/cloud-debug-nodejs/issues/744)) ([e322b6c](https://www.github.com/googleapis/cloud-debug-nodejs/commit/e322b6c))
* **deps:** update @sindresorhus/is to v1 ([#747](https://www.github.com/googleapis/cloud-debug-nodejs/issues/747)) ([dac1102](https://www.github.com/googleapis/cloud-debug-nodejs/commit/dac1102))
* **deps:** update dependency acorn to v7 ([#748](https://www.github.com/googleapis/cloud-debug-nodejs/issues/748)) ([ddc3629](https://www.github.com/googleapis/cloud-debug-nodejs/commit/ddc3629))
* **deps:** use the latest extend ([#735](https://www.github.com/googleapis/cloud-debug-nodejs/issues/735)) ([2d60f49](https://www.github.com/googleapis/cloud-debug-nodejs/commit/2d60f49))
* **docs:** link to reference docs section on googleapis.dev ([#724](https://www.github.com/googleapis/cloud-debug-nodejs/issues/724)) ([6d809e6](https://www.github.com/googleapis/cloud-debug-nodejs/commit/6d809e6))

### [4.0.1](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v4.0.0...v4.0.1) (2019-06-24)


### Bug Fixes

* **docs:** add repo-metadata file ([#722](https://www.github.com/googleapis/cloud-debug-nodejs/issues/722)) ([1390590](https://www.github.com/googleapis/cloud-debug-nodejs/commit/1390590))

## [4.0.0](https://www.github.com/googleapis/cloud-debug-nodejs/compare/v3.2.0...v4.0.0) (2019-06-05)


### ⚠ BREAKING CHANGES

* upgrade engines field to >=8.10.0 (#680)

### Bug Fixes

* **deps:** update dependency @google-cloud/common to v1 ([#692](https://www.github.com/googleapis/cloud-debug-nodejs/issues/692)) ([eeaeac8](https://www.github.com/googleapis/cloud-debug-nodejs/commit/eeaeac8))
* **deps:** update dependency express to v4.17.0 ([#695](https://www.github.com/googleapis/cloud-debug-nodejs/issues/695)) ([90420bd](https://www.github.com/googleapis/cloud-debug-nodejs/commit/90420bd))
* **deps:** update dependency express to v4.17.1 ([#708](https://www.github.com/googleapis/cloud-debug-nodejs/issues/708)) ([97bfa7b](https://www.github.com/googleapis/cloud-debug-nodejs/commit/97bfa7b))
* **deps:** update dependency gcp-metadata to v2 ([#691](https://www.github.com/googleapis/cloud-debug-nodejs/issues/691)) ([3a4b275](https://www.github.com/googleapis/cloud-debug-nodejs/commit/3a4b275))


### Build System

* upgrade engines field to >=8.10.0 ([#680](https://www.github.com/googleapis/cloud-debug-nodejs/issues/680)) ([d36462e](https://www.github.com/googleapis/cloud-debug-nodejs/commit/d36462e))


### Features

* add `get()` function ([#709](https://www.github.com/googleapis/cloud-debug-nodejs/issues/709)) ([003c662](https://www.github.com/googleapis/cloud-debug-nodejs/commit/003c662))
* support apiEndpoint override ([#713](https://www.github.com/googleapis/cloud-debug-nodejs/issues/713)) ([dfa349e](https://www.github.com/googleapis/cloud-debug-nodejs/commit/dfa349e))

## v3.2.0

05-02-2019 08:18 PDT

### Implementation Changes

### New Features
- feat: add debugger support for Cloud Run. See b/112087600 for context ([#671](https://github.com/googleapis/cloud-debug-nodejs/pull/671))
- fix: use stableObjectId field for object equality in Node 10+ ([#524](https://github.com/googleapis/cloud-debug-nodejs/pull/524))

### Dependencies
- chore(deps): update dependency @types/nock to v10 ([#674](https://github.com/googleapis/cloud-debug-nodejs/pull/674))
- chore(deps): update dependency nyc to v14 ([#669](https://github.com/googleapis/cloud-debug-nodejs/pull/669))
- fix(deps): update dependency @google-cloud/common to ^0.32.0 ([#667](https://github.com/googleapis/cloud-debug-nodejs/pull/667))
- chore(deps): update dependency @types/semver to v6
- chore(deps): drop unused dependency on broken-link-checker-local
- chore(deps): update dependency typescript to ~3.4.0
- fix(deps): update dependency semver to v6
- chore(deps): update dependency @types/node to ~10.14.0

### Documentation

### Internal / Testing Changes
- update to .nycrc with --all enabled ([#675](https://github.com/googleapis/cloud-debug-nodejs/pull/675))
- test: add smoke test for app sample ([#663](https://github.com/googleapis/cloud-debug-nodejs/pull/663))
- chore: drop duplicate nyc config ([#665](https://github.com/googleapis/cloud-debug-nodejs/pull/665))
- chore: publish to npm using wombat ([#655](https://github.com/googleapis/cloud-debug-nodejs/pull/655))
- build: use per-repo publish token ([#654](https://github.com/googleapis/cloud-debug-nodejs/pull/654))

## v3.1.0

03-12-2019 16:20 PDT

### New Features
- feat: make logpoint function customizable ([#634](https://github.com/googleapis/cloud-debug-nodejs/pull/634))

### Bug Fixes
- fix: correct typings for SourceContext ([#626](https://github.com/googleapis/cloud-debug-nodejs/pull/626))
- fix: add webpack support to the Sourcemapper ([#640](https://github.com/googleapis/cloud-debug-nodejs/pull/640))
- fix: avoid spurious 'unable to clear' errors ([#624](https://github.com/googleapis/cloud-debug-nodejs/pull/624))

### Dependencies
- fix: update @google-cloud/common to ^0.31.0 ([#639](https://github.com/googleapis/cloud-debug-nodejs/pull/639))
- fix(deps): update dependency gcp-metadata to v1
- fix(deps): update dependency @sindresorhus/is to ^0.15.0 ([#619](https://github.com/googleapis/cloud-debug-nodejs/pull/619))

### Documentation
- docs: add samples code ([#633](https://github.com/googleapis/cloud-debug-nodejs/pull/633))
- docs: update links in contrib guide ([#637](https://github.com/googleapis/cloud-debug-nodejs/pull/637))
- docs: update contributing guide ([#628](https://github.com/googleapis/cloud-debug-nodejs/pull/628))
- docs: add lint/fix example to contributing guide ([#621](https://github.com/googleapis/cloud-debug-nodejs/pull/621))

### Internal / Testing Changes
- build: Add docuploader credentials to node publish jobs ([#648](https://github.com/googleapis/cloud-debug-nodejs/pull/648))
- build: use node10 to run samples-test, system-test etc ([#647](https://github.com/googleapis/cloud-debug-nodejs/pull/647))
- build: add configs to import keys for builds
- chore: remove p-limit types ([#645](https://github.com/googleapis/cloud-debug-nodejs/pull/645))
- chore: Delete unused region tags ([#644](https://github.com/googleapis/cloud-debug-nodejs/pull/644))
- chore(deps): update dependency mocha to v6
- build: use linkinator for docs test ([#636](https://github.com/googleapis/cloud-debug-nodejs/pull/636))
- test: use unique service context for e2e tests ([#638](https://github.com/googleapis/cloud-debug-nodejs/pull/638))
- chore: add missing dev dependency ([#635](https://github.com/googleapis/cloud-debug-nodejs/pull/635))
- test: add grpcjs system tests ([#631](https://github.com/googleapis/cloud-debug-nodejs/pull/631))
- refactor: address TODO about id type ([#627](https://github.com/googleapis/cloud-debug-nodejs/pull/627))
- build: create docs test npm scripts ([#630](https://github.com/googleapis/cloud-debug-nodejs/pull/630))
- chore: remove unneeded code ([#625](https://github.com/googleapis/cloud-debug-nodejs/pull/625))
- chore: update acorn to version 6 ([#620](https://github.com/googleapis/cloud-debug-nodejs/pull/620))
- chore: upgrade typescript to ~3.3.0 ([#618](https://github.com/googleapis/cloud-debug-nodejs/pull/618))
- build: ignore googleapis.com in doc link check ([#615](https://github.com/googleapis/cloud-debug-nodejs/pull/615))
- build: check broken links in generated docs ([#612](https://github.com/googleapis/cloud-debug-nodejs/pull/612))
- chore(build): inject yoshi automation key ([#608](https://github.com/googleapis/cloud-debug-nodejs/pull/608))

## v3.0.1

12-11-2018 14:18 PST

### Implementation Changes
- fix: use well-formatted URLs when setting breakpoints ([#535](https://github.com/googleapis/cloud-debug-nodejs/pull/535))

### Dependencies
- chore: update `teeny-request` ([#589](https://github.com/googleapis/cloud-debug-nodejs/pull/589))
- fix(deps): update dependency @google-cloud/common to ^0.27.0 ([#586](https://github.com/googleapis/cloud-debug-nodejs/pull/586))
- refactor: drop dependencies on request and lodash ([#585](https://github.com/googleapis/cloud-debug-nodejs/pull/585))
- chore(deps): update dependency @types/node to ~10.12.0 ([#546](https://github.com/googleapis/cloud-debug-nodejs/pull/546))
- refactor: remove a few unused dependencies ([#584](https://github.com/googleapis/cloud-debug-nodejs/pull/584))
- chore: make `npm test` platform independent ([#583](https://github.com/googleapis/cloud-debug-nodejs/pull/583))
- chore(deps): update dependency gts to ^0.9.0 ([#580](https://github.com/googleapis/cloud-debug-nodejs/pull/580))
- fix(deps): update dependency @google-cloud/common to ^0.26.0 ([#552](https://github.com/googleapis/cloud-debug-nodejs/pull/552))
- fix(deps): update dependency gcp-metadata to ^0.9.0 ([#566](https://github.com/googleapis/cloud-debug-nodejs/pull/566))
- chore: update issue templates ([#565](https://github.com/googleapis/cloud-debug-nodejs/pull/565))
- fix(deps): update dependency gcp-metadata to ^0.8.0 ([#548](https://github.com/googleapis/cloud-debug-nodejs/pull/548))
- chore(deps): update dependency @types/glob to v7 ([#549](https://github.com/googleapis/cloud-debug-nodejs/pull/549))
- chore(deps): update dependency typescript to ~3.1.0 ([#547](https://github.com/googleapis/cloud-debug-nodejs/pull/547))
- chore(deps): update dependency nock to v10 ([#551](https://github.com/googleapis/cloud-debug-nodejs/pull/551))
- fix(deps): update dependency @google-cloud/common to ^0.25.0 ([#520](https://github.com/googleapis/cloud-debug-nodejs/pull/520))

### Internal / Testing Changes
- chore: update nyc and eslint configs ([#607](https://github.com/googleapis/cloud-debug-nodejs/pull/607))
- chore: fix publish.sh permission +x ([#605](https://github.com/googleapis/cloud-debug-nodejs/pull/605))
- fix(build): fix Kokoro release script ([#604](https://github.com/googleapis/cloud-debug-nodejs/pull/604))
- build: add Kokoro configs for autorelease ([#603](https://github.com/googleapis/cloud-debug-nodejs/pull/603))
- chore: always nyc report before calling codecov ([#600](https://github.com/googleapis/cloud-debug-nodejs/pull/600))
- chore: nyc ignore build/test by default ([#599](https://github.com/googleapis/cloud-debug-nodejs/pull/599))
- chore(build): update prettier and renovate config ([#597](https://github.com/googleapis/cloud-debug-nodejs/pull/597))
- chore: update system tests key ([#596](https://github.com/googleapis/cloud-debug-nodejs/pull/596))
- chore: update license file ([#595](https://github.com/googleapis/cloud-debug-nodejs/pull/595))
- fix(build): fix system key decryption ([#591](https://github.com/googleapis/cloud-debug-nodejs/pull/591))
- chore: use a uuid in system tests ([#590](https://github.com/googleapis/cloud-debug-nodejs/pull/590))
- chore: add encrypted key for system tests ([#588](https://github.com/googleapis/cloud-debug-nodejs/pull/588))
- chore: add synth.metadata
- chore: update eslintignore config ([#579](https://github.com/googleapis/cloud-debug-nodejs/pull/579))
- chore: drop contributors from multiple places ([#578](https://github.com/googleapis/cloud-debug-nodejs/pull/578))
- chore: use latest npm on Windows ([#576](https://github.com/googleapis/cloud-debug-nodejs/pull/576))
- chore: update CircleCI config ([#574](https://github.com/googleapis/cloud-debug-nodejs/pull/574))
- chore: include build in eslintignore ([#571](https://github.com/googleapis/cloud-debug-nodejs/pull/571))
- fix: fix Node 11 tests ([#569](https://github.com/googleapis/cloud-debug-nodejs/pull/569))
- chore: remove old issue template ([#563](https://github.com/googleapis/cloud-debug-nodejs/pull/563))
- fix: fix Node 10.12.0 specific test failures ([#560](https://github.com/googleapis/cloud-debug-nodejs/pull/560))
- build: run tests on node11 ([#561](https://github.com/googleapis/cloud-debug-nodejs/pull/561))
- chores(build): do not collect sponge.xml from windows builds ([#550](https://github.com/googleapis/cloud-debug-nodejs/pull/550))
- chore: update new issue template ([#544](https://github.com/googleapis/cloud-debug-nodejs/pull/544))
- build: fix codecov uploading on Kokoro ([#540](https://github.com/googleapis/cloud-debug-nodejs/pull/540))
- Update kokoro config ([#538](https://github.com/googleapis/cloud-debug-nodejs/pull/538))
- Update kokoro config ([#534](https://github.com/googleapis/cloud-debug-nodejs/pull/534))
- test: remove appveyor config ([#533](https://github.com/googleapis/cloud-debug-nodejs/pull/533))
- chore: update kokoro config ([#532](https://github.com/googleapis/cloud-debug-nodejs/pull/532))
- Enable prefer-const in the eslint config ([#531](https://github.com/googleapis/cloud-debug-nodejs/pull/531))

## 2018-09-18, Version 3.0.0 (Beta), @dominickramer

This version drops support for Node 4, adds the `pathResolver` configuration option to support debugging files that have ambiguous paths, and adds a fix to handle debugging objects with circular references (for Node <10).

### Breaking Changes

* chore: drop support for node.js 4 (#440) `d6318d8`

### Features

* feat: pathResolver to allow arbitrary path mapping on behalf of agent (#461) `a0a27f0`
* feat: use small HTTP dependency (#510) `ce903bc`

### Fixes

* fix: handle circular refs correctly with legacy debugging API (#515) `8e6cf9b`
* fix: allow snapshots in shorter transpiled files (#513) `9512bac`
* fix: move vm.runInDebugContext to constructor (#509) `6b33feb`
* fix(deps): update @google-cloud/common to ^0.23.0 (#506) `f67d1af`
* fix: fix the `workingDirectory` root dir test (#492) `dd8e4af`
* fix: delegate auth logic to google-auth-library (#489) `841609a`
* fix: fix installation tests (#488) `8356b15`
* fix(deps): update dependency gcp-metadata to ^0.7.0 (#474) `3a2369d`
* fix(deps): update dependency coffeescript to v2 (#476) `30747fa`
* fix: fix package warnings for coffee-script and source-maps (#441) `4a7ee90`
* fix: stop testing node 4 on appveyor (#444) `9df77ea`
* fix: clean up the readme (#442) `521aa69`


## 2018-06-12, Version 2.6.0 (Beta), @dominickramer

This release adds side-effect-free evaluation [#335](https://github.com/googleapis/cloud-debug-nodejs/issues/335) and fixes an issue where when a breakpoint is hit in a transpiled file, the line number of the breakpoint incorrectly changes [#436](https://github.com/googleapis/cloud-debug-nodejs/issues/436).

### Commits

* fix: line numbers don't change in transpiled files (#436) `2d7a0f7`
* docs: fix image links on npmjs.com (#435) `71ae615`
* chore: remove stripResults parameter (#432) `e42836f`
* chore: clean up test-e2e.ts (#431) `a627642`
* feat: implement side-effect-free expression evaluation (#335) `173c9e7`
* chore: remove the GCLOUD_USE_INSPECTOR env var (#429) `73b171e`
* chore: change the gts version to `^0.5.4` (#427) `54d3d10`
* chore: add tests to verify evaluated expressions (#425) `d03e0e5`
* chore(package): update @types/node to version 10.0.3 (#424) `cc40309`

## 2018-04-27, Version 2.5.1 (Beta), @dominickramer

This release addresses issue [#420](https://github.com/googleapis/cloud-debug-nodejs/issues/420).  In particular, if `semver` version `5.1.0` was already installed as a dependency prior to installing `@google-cloud/debug-agent`, the agent would have an out of date version of `semver` and would fail to start.

### Commits

* chore: update semver to `5.5.0` (#421) `960bbc7`
* chore: test on Node 10 (#419) `9b15b29`
* chore(package): update @types/estree to version 0.0.39 (#416) `9c4427e`

## 2018-04-17, Version 2.5.0 (Beta), @dominickramer

This release adds support for Node 10 by always using the inspector protocol on Node >= 10.  This is needed  because the `vm.runInDebugContext` function, needed to use the legacy debug protocol, is no longer available in Node 10.

### Commits
* feat: support Node 10 (#412) `b21b084`
* fix(package): update @google-cloud/common to version 0.17.0 (#410) `6c4a878`
* chore(package): update @types/mocha to version 5.0.0 (#411) `87fdf0e`

## 2018-03-16, Version 2.4.0 (Beta), @dominickramer

With this release:
* [@google-cloud/common](https://www.npmjs.com/package/@google-cloud/common) has been updated to version `0.16.0`.  This addresses issue [#405](https://github.com/googleapis/cloud-debug-nodejs/issues/405).
* The `GAE_DEPLOYMENT_ID` environment variable (with a fallback to `GAE_MINOR_VERSION`) will now be used as the default value of `minorVersion_`.

### Commits
* [[`d2cf1bcdc9`](https://github.com/googleapis/cloud-debug-nodejs/commit/d2cf1bcdc9)] - **chore**: remove js-green-licenses.json (#408) (Dominic Kramer)
* [[`ca643666e5`](https://github.com/googleapis/cloud-debug-nodejs/commit/ca643666e5)] - **chore**: update `proxyquire` to `2.0.0` (#406) (Dominic Kramer)
* [[`9c4c1bb5a9`](https://github.com/googleapis/cloud-debug-nodejs/commit/9c4c1bb5a9)] - **chore**: update gcp-metadata to 0.6.3 (#407) (Dominic Kramer)
* [[`6e933cb331`](https://github.com/googleapis/cloud-debug-nodejs/commit/6e933cb331)] - chore(package): update js-green-licenses to version 0.5.0 (#404) (greenkeeper[bot])
* [[`f6985f7a6a`](https://github.com/googleapis/cloud-debug-nodejs/commit/f6985f7a6a)] - **feat**: GAE\_DEPLOYMENT\_ID used for minor version (#400) (Dominic Kramer)
* [[`e19e514a67`](https://github.com/googleapis/cloud-debug-nodejs/commit/e19e514a67)] - Update gcp-metadata to the latest version 🚀 (#395) (greenkeeper[bot])
* [[`9c93e7fb4e`](https://github.com/googleapis/cloud-debug-nodejs/commit/9c93e7fb4e)] - fix(package): update @google-cloud/common to version 0.16.0 (#394) (greenkeeper[bot])
* [[`9a5d8a1066`](https://github.com/googleapis/cloud-debug-nodejs/commit/9a5d8a1066)] - chore(package): update mocha to version 5.0.0 (#392) (greenkeeper[bot])
* [[`b09419ebf6`](https://github.com/googleapis/cloud-debug-nodejs/commit/b09419ebf6)] - chore(package): update js-green-licenses to version 0.4.0 (#390) (greenkeeper[bot])
* [[`bcab5cb0b1`](https://github.com/googleapis/cloud-debug-nodejs/commit/bcab5cb0b1)] - chore(package): update js-green-licenses to version 0.3.1 (#389) (greenkeeper[bot])
* [[`3b2a3ef412`](https://github.com/googleapis/cloud-debug-nodejs/commit/3b2a3ef412)] - **chore**: license check as posttest (#384) (Jinwoo Lee)
* [[`56b8340153`](https://github.com/googleapis/cloud-debug-nodejs/commit/56b8340153)] - chore(package): update @types/node to version 9.3.0 (#385) (greenkeeper[bot])
* [[`bcc3b893fa`](https://github.com/googleapis/cloud-debug-nodejs/commit/bcc3b893fa)] - Update LICENSE (#386) (chenyumic)

## 2017-12-21, Version 2.3.2 (Beta), @dominickramer

This release addresses issues:
* [Gracefully handle unexpected source maps #366](https://github.com/googleapis/cloud-debug-nodejs/issues/366)
* [GKE: Error scanning the filesystem #377](https://github.com/googleapis/cloud-debug-nodejs/issues/377)

### Commits
* [[`3b97598725`](https://github.com/googleapis/cloud-debug-nodejs/commit/3b97598725)] - **fix**: refuse to start if working dir is root dir (#381) (Dominic Kramer)
* [[`5c93c445b6`](https://github.com/googleapis/cloud-debug-nodejs/commit/5c93c445b6)] - **fix**: Address startup failure from file access errors (#379) (Dominic Kramer)
* [[`e38854efdc`](https://github.com/googleapis/cloud-debug-nodejs/commit/e38854efdc)] - **fix**: index only .js.map source map files (#371) (Dominic Kramer)
* [[`c75494cfc1`](https://github.com/googleapis/cloud-debug-nodejs/commit/c75494cfc1)] - **chore**: Replace it.only with it in test-install.ts (#380) (Dominic Kramer)
* [[`f24a466290`](https://github.com/googleapis/cloud-debug-nodejs/commit/f24a466290)] - **chore(package)**: update @types/nock to version 9.1.0 (#378) (greenkeeper[bot])
* [[`7fef0a432e`](https://github.com/googleapis/cloud-debug-nodejs/commit/7fef0a432e)] - **fix**: Remove the `process` warning listener (#376) (Dominic Kramer)

## 2017-12-11, Version 2.3.1 (Beta), @dominickramer

This release addresses issue [#367](https://github.com/googleapis/cloud-debug-nodejs/issues/367) where compile time errors would occur when using the agent within Typescript code.

In addition, the `isReady` functionality has been documented.

### Commits
* [[`cc8803122e`](https://github.com/googleapis/cloud-debug-nodejs/commit/cc8803122e)] - **chore**: Remove casts when accessing config props (#374) (Dominic Kramer)
* [[`5b493170be`](https://github.com/googleapis/cloud-debug-nodejs/commit/5b493170be)] - **fix**: only look for relevant files in scanner test (#372) (Dominic Kramer)
* [[`37399c2e70`](https://github.com/googleapis/cloud-debug-nodejs/commit/37399c2e70)] - **fix**: Address compilation errors when using the agent with Typescript (#370) (Dominic Kramer)
* [[`d7bec412f0`](https://github.com/googleapis/cloud-debug-nodejs/commit/d7bec412f0)] - **chore**: Run `gts fix` and manually fix some errors (#369) (Dominic Kramer)
* [[`1d300ace78`](https://github.com/googleapis/cloud-debug-nodejs/commit/1d300ace78)] - **chore**: Update Readme to include isReady interface (#368) (Michael Gao)

## 2017-11-20, Version 2.3.0 (Beta), @dominickramer

This release introduces a new `isReady` method that returns a `Promise` that is resolved either when the debug agent has received snapshot information from the Stackdriver service, or has determined that it is not possible to receive this information.

This is needed in environments such as Google Cloud Functions where, without this functionality, application code is completed before the debug agent has received its snapshot information.

This release also fixes an issue so that now a more friendly error message is provided in the case when the debug agent cannot determine the project ID.

### Commits
* [[`a828ea62a4`](https://github.com/googleapis/cloud-debug-nodejs/commit/a828ea62a4)] - **feat**: Enable isReady for debugger for GCF (#358) (Michael Gao)
* [[`bbf4b98848`](https://github.com/googleapis/cloud-debug-nodejs/commit/bbf4b98848)] - **chore**: Move install tests to `system-test` (#361) (Dominic Kramer)
* [[`acdefca12e`](https://github.com/googleapis/cloud-debug-nodejs/commit/acdefca12e)] - **test**: add installation verification (#359) (Dominic Kramer)
* [[`6e0088e5bf`](https://github.com/googleapis/cloud-debug-nodejs/commit/6e0088e5bf)] - **fix**: Give useful message with unresolved projectID (#360) (Dominic Kramer)
* [[`a530d1cdb2`](https://github.com/googleapis/cloud-debug-nodejs/commit/a530d1cdb2)] - Update dependencies to enable Greenkeeper 🌴 (#348) (greenkeeper[bot])
* [[`cdee56fda5`](https://github.com/googleapis/cloud-debug-nodejs/commit/cdee56fda5)] - **chore**: Upgrade to Typescript `~2.6.1` (#355) (Dominic Kramer)
* [[`1553565742`](https://github.com/googleapis/cloud-debug-nodejs/commit/1553565742)] - **fix**: broken link in README (#353) (Ali Ijaz Sheikh)
* [[`b95bae2d9c`](https://github.com/googleapis/cloud-debug-nodejs/commit/b95bae2d9c)] - **chore**: Use `gts` instead of `gulp` (#344) (Dominic Kramer)
* [[`e1089673f2`](https://github.com/googleapis/cloud-debug-nodejs/commit/e1089673f2)] - **fix**: Skip 32bit platform warning starting on 8.9 (#351) (Michael Gao)
* [[`185f1c2e5d`](https://github.com/googleapis/cloud-debug-nodejs/commit/185f1c2e5d)] - **fix**: make debugee variables public (#352) (Michael Gao)


## 2017-10-25, Version 2.2.2 (Beta), @dominickramer

This release fixes an issue that prevented this module from being published, and it contains all of the changes that would have been in the 2.2.0 and 2.2.1 releases (if those releases would have actually been successfully published).

### Commits
* [[`bc486043b8`](https://github.com/googleapis/cloud-debug-nodejs/commit/bc486043b8)] - Remove `package.json` from `build` directory (#349) (Dominic Kramer)
* [[`c4d61f2435`](https://github.com/googleapis/cloud-debug-nodejs/commit/c4d61f2435)] - **chore**: update dep: gcp-metadata (#346) (Ali Ijaz Sheikh)
* [[`b9085453fe`](https://github.com/googleapis/cloud-debug-nodejs/commit/b9085453fe)] - Allow a single direct access point to package.json (#347) (Dominic Kramer)


## 2017-10-23, Version 2.2.1 (Beta), @dominickramer

This release is identical to version 2.2.0 and only exists because a publishing error occurred that prevented the release of version 2.2.0.

## 2017-10-23, Version 2.2.0 (Beta), @dominickramer

* This release includes experimental support for the new [V8 Inspector Protocol](https://chromedevtools.github.io/debugger-protocol-viewer/v8/) ([#329](https://github.com/googleapis/cloud-debug-nodejs/pull/329)) and fixes an issue with setting snapshots on lines that cannot directly have snapshots set, such as comments ([#330](https://github.com/googleapis/cloud-debug-nodejs/pull/330)).

  * The Stackdriver Debugger will use the V8 Inspector Protocol if and only if the `GCLOUD_USE_INSPECTOR` environment variable is set and the running version of Node supports the inspector protocol (Node 8+).

  * If the `GCLOUD_USE_INSPECTOR` environment variable is set, but the running version of Node does not support the inspector protocol, the agent will fall back to the legacy debugger protocol and a warning message will be logged.

### Commits
* [[`c15872df2c`](https://github.com/googleapis/cloud-debug-nodejs/commit/c15872df2c)] - Inspector only enabled when specified (#343) (Michael Gao)
* [[`964cc31a0f`](https://github.com/googleapis/cloud-debug-nodejs/commit/964cc31a0f)] - Elaborate on async stack trace warning (#340) (Michael Gao)
* [[`82fb478bca`](https://github.com/googleapis/cloud-debug-nodejs/commit/82fb478bca)] - Reorganize code (#337) (Dominic Kramer)
* [[`d4cf182924`](https://github.com/googleapis/cloud-debug-nodejs/commit/d4cf182924)] - Remove powerscript in appveyor config (#339) (Michael Gao)
* [[`fa41721e96`](https://github.com/googleapis/cloud-debug-nodejs/commit/fa41721e96)] - Fix system test break (#333) (Michael Gao)
* [[`be0f2fde64`](https://github.com/googleapis/cloud-debug-nodejs/commit/be0f2fde64)] - **fix**: update dep gcp-metadata (#334) (Ali Ijaz Sheikh)
* [[`3114892715`](https://github.com/googleapis/cloud-debug-nodejs/commit/3114892715)] - Implement v8 Inspector Protocol (#329) (Michael Gao)
* [[`015f29c842`](https://github.com/googleapis/cloud-debug-nodejs/commit/015f29c842)] - Add dependency on extend@3 (#332) (Kelvin Jin) [#332](https://github.com/googleapis/cloud-debug-nodejs/pull/332)
* [[`7a7b20dcd9`](https://github.com/googleapis/cloud-debug-nodejs/commit/7a7b20dcd9)] - Adjust api breakpoint if resolved in another line (#330) (Michael Gao)
* [[`bd4a59c5ec`](https://github.com/googleapis/cloud-debug-nodejs/commit/bd4a59c5ec)] - Remove args in state.ts#resolveLocalList (#331) (Michael Gao)
* [[`9ecff8bd9b`](https://github.com/googleapis/cloud-debug-nodejs/commit/9ecff8bd9b)] - Change v8debugAPI clear to async. (#327) (Michael Gao)
* [[`fa36973fbf`](https://github.com/googleapis/cloud-debug-nodejs/commit/fa36973fbf)] - Address a formating error across Node versions (#328) (Dominic Kramer)
* [[`17be882a3a`](https://github.com/googleapis/cloud-debug-nodejs/commit/17be882a3a)] - Fix `.ts` files being copied to the build dir (#325) (Dominic Kramer)
* [[`b58b2f7308`](https://github.com/googleapis/cloud-debug-nodejs/commit/b58b2f7308)] - Address Some TODOs (#324) (Dominic Kramer)
* [[`1a253cee5b`](https://github.com/googleapis/cloud-debug-nodejs/commit/1a253cee5b)] - Update `package-lock.json` for tests to Typescript (#323) (Dominic Kramer)
* [[`e8bd0cf56b`](https://github.com/googleapis/cloud-debug-nodejs/commit/e8bd0cf56b)] - Enable checking test linting/formatting errors (#322) (Dominic Kramer)
* [[`40365fbcac`](https://github.com/googleapis/cloud-debug-nodejs/commit/40365fbcac)] - Enable all compiler options (#321) (Dominic Kramer)
* [[`29ba46bf4e`](https://github.com/googleapis/cloud-debug-nodejs/commit/29ba46bf4e)] - Add type annotations (#320) (Dominic Kramer)
* [[`3bf2276165`](https://github.com/googleapis/cloud-debug-nodejs/commit/3bf2276165)] - Remove usage of `use strict` (#319) (Dominic Kramer)
* [[`3c2dbba02c`](https://github.com/googleapis/cloud-debug-nodejs/commit/3c2dbba02c)] - The `test/debugger.ts` file uses class syntax (#318) (Dominic Kramer)
* [[`7952610ad0`](https://github.com/googleapis/cloud-debug-nodejs/commit/7952610ad0)] - Update tests to use `let` or `const` instead of `var` (#317) (Dominic Kramer)
* [[`df2c5651d7`](https://github.com/googleapis/cloud-debug-nodejs/commit/df2c5651d7)] - Update the tests to use `import` syntax (#316) (Dominic Kramer)
* [[`a21c83d920`](https://github.com/googleapis/cloud-debug-nodejs/commit/a21c83d920)] - Update test files to use the `.ts` extension (#315) (Dominic Kramer)
* [[`232e494774`](https://github.com/googleapis/cloud-debug-nodejs/commit/232e494774)] - Run tests from within the `build` directory (#314) (Dominic Kramer) [#314](https://github.com/googleapis/cloud-debug-nodejs/pull/314)

## 2017-07-17, Version 2.1.3 (Beta), @ofrobots

This module is now in Beta. This release (re)-fixes the naming of debug targets on GKE (#308) along with a fuzzy search for sourcemaps (#306).

### Commits
* [[`eff37c20f5`](https://github.com/googleapis/cloud-debug-nodejs/commit/eff37c20f5)] - beta (#310) (Ali Ijaz Sheikh)
* [[`70d8730d13`](https://github.com/googleapis/cloud-debug-nodejs/commit/70d8730d13)] - Use clusterName as service name on GKE (#309) (Ali Ijaz Sheikh)
* [[`8ddb5ec87f`](https://github.com/googleapis/cloud-debug-nodejs/commit/8ddb5ec87f)] - Simplify metadata (#308) (Ali Ijaz Sheikh)
* [[`800ed08d5e`](https://github.com/googleapis/cloud-debug-nodejs/commit/800ed08d5e)] - Start using async/await to flatten the pyramid in Debuglet.start (#307) (Ali Ijaz Sheikh)
* [[`db21564549`](https://github.com/googleapis/cloud-debug-nodejs/commit/db21564549)] - Use fuzzy search when using sourcemaps (#306) (Dominic Kramer)
* [[`f13d122718`](https://github.com/googleapis/cloud-debug-nodejs/commit/f13d122718)] - lint, tooling, and other misc. changes (#304) (Ali Ijaz Sheikh)
* [[`dd8ef67432`](https://github.com/googleapis/cloud-debug-nodejs/commit/dd8ef67432)] - switch to package-lock.json (#305) (Ali Ijaz Sheikh)
* [[`2d07105969`](https://github.com/googleapis/cloud-debug-nodejs/commit/2d07105969)] - tune up configuration types (#300) (Ali Ijaz Sheikh)
* [[`9eb42e66e7`](https://github.com/googleapis/cloud-debug-nodejs/commit/9eb42e66e7)] - npm scripts cleanup (#302) (Ali Ijaz Sheikh)
* [[`2297c09557`](https://github.com/googleapis/cloud-debug-nodejs/commit/2297c09557)] - Lint and yarn (#301) (Ali Ijaz Sheikh)
* [[`7ccdcd7274`](https://github.com/googleapis/cloud-debug-nodejs/commit/7ccdcd7274)] - drop test dependency on proxyquire (#303) (Ali Ijaz Sheikh)
* [[`0679ec7835`](https://github.com/googleapis/cloud-debug-nodejs/commit/0679ec7835)] - v2.1.2 (Ali Ijaz Sheikh)

## 2017-07-05, Version 2.1.2 (Experimental), @ofrobots

This release fixes the handling of `waitExpired` (#287) which was causing breakpoints to be expired too early.

### Commits
* [[`16bf513a82`](https://github.com/googleapis/cloud-debug-nodejs/commit/16bf513a82)] - move src.ts back to src (#297) (Ali Ijaz Sheikh)
* [[`edfb19bc91`](https://github.com/googleapis/cloud-debug-nodejs/commit/edfb19bc91)] - delete accidentally committed file (#298) (Ali Ijaz Sheikh)
* [[`31b6e9f231`](https://github.com/googleapis/cloud-debug-nodejs/commit/31b6e9f231)] - Build and packaging cleanups (#296) (Ali Ijaz Sheikh)
* [[`334fba2f06`](https://github.com/googleapis/cloud-debug-nodejs/commit/334fba2f06)] - fixe typos: waitExpired, successOnTimeout (#287) (Ali Ijaz Sheikh)
* [[`8906108524`](https://github.com/googleapis/cloud-debug-nodejs/commit/8906108524)] - Update `debug.ts` to use class syntax (#295) (Dominic Kramer) [#295](https://github.com/googleapis/cloud-debug-nodejs/pull/295)
* [[`8d044a28ae`](https://github.com/googleapis/cloud-debug-nodejs/commit/8d044a28ae)] - Format the code (#294) (Dominic Kramer) [#294](https://github.com/googleapis/cloud-debug-nodejs/pull/294)
* [[`8202cf044b`](https://github.com/googleapis/cloud-debug-nodejs/commit/8202cf044b)] - Enable all `tsconfig.json` options (#293) (Dominic Kramer) [#293](https://github.com/googleapis/cloud-debug-nodejs/pull/293)
* [[`499112ccf2`](https://github.com/googleapis/cloud-debug-nodejs/commit/499112ccf2)] - Reformat the code and enable linting (#292) (Dominic Kramer) [#292](https://github.com/googleapis/cloud-debug-nodejs/pull/292)
* [[`675ef726af`](https://github.com/googleapis/cloud-debug-nodejs/commit/675ef726af)] - Add types to all non-test files (#291) (Dominic Kramer) [#291](https://github.com/googleapis/cloud-debug-nodejs/pull/291)
* [[`2733e5c711`](https://github.com/googleapis/cloud-debug-nodejs/commit/2733e5c711)] - Convert `var` to `const` or `let` (#290) (Dominic Kramer) [#290](https://github.com/googleapis/cloud-debug-nodejs/pull/290)
* [[`a0f9cc47d0`](https://github.com/googleapis/cloud-debug-nodejs/commit/a0f9cc47d0)] - Convert `require`s to `import`s (#289) (Dominic Kramer) [#289](https://github.com/googleapis/cloud-debug-nodejs/pull/289)
* [[`e135835ac6`](https://github.com/googleapis/cloud-debug-nodejs/commit/e135835ac6)] - **TS**: Convert `debug-assert.js` to Typescript (#288) (Dominic Kramer) [#288](https://github.com/googleapis/cloud-debug-nodejs/pull/288)
* [[`8d4467ebb0`](https://github.com/googleapis/cloud-debug-nodejs/commit/8d4467ebb0)] - Update README. (#282) (Jason Dobry)
* [[`ccf504b5fc`](https://github.com/googleapis/cloud-debug-nodejs/commit/ccf504b5fc)] - Fix the system tests (#286) (Dominic Kramer) [#286](https://github.com/googleapis/cloud-debug-nodejs/pull/286)
* [[`ec19973ce4`](https://github.com/googleapis/cloud-debug-nodejs/commit/ec19973ce4)] - Use Typescript class syntax (#285) (Dominic Kramer) [#285](https://github.com/googleapis/cloud-debug-nodejs/pull/285)
* [[`8ee9583f18`](https://github.com/googleapis/cloud-debug-nodejs/commit/8ee9583f18)] - Initial gulpfile that only maps src.ts to src (#281) (Dominic Kramer) [#281](https://github.com/googleapis/cloud-debug-nodejs/pull/281)
* [[`4bf7b8f5b8`](https://github.com/googleapis/cloud-debug-nodejs/commit/4bf7b8f5b8)] - v2.1.1 (Ali Ijaz Sheikh)

## 2017-06-18, Version 2.1.1 (Experimental), @ofrobots

This release reverts #275 which was regressing debuggee identification on GAE and GCE.

* [[`66d67f8b1b`](https://github.com/googleapis/cloud-debug-nodejs/commit/66d67f8b1b)] - ***Revert*** "Use service name as debuggee id on gke (#275)" (#278)" (Ali Ijaz Sheikh)
* [[`e3c4853fdb`](https://github.com/googleapis/cloud-debug-nodejs/commit/e3c4853fdb)] - Document the support of transpiled code (#277) (Dominic Kramer) [#277](https://github.com/googleapis/cloud-debug-nodejs/pull/277)

## 2017-06-12, Version 2.1.0 (Experimental), @matthewloring

### Notable changes

**UI**

  * [[`53562ccc89`](https://github.com/googleapis/cloud-debug-nodejs/commit/53562ccc89)] - Update truncated object message (#269) (Matthew Loring) [#269](https://github.com/googleapis/cloud-debug-nodejs/pull/269)
  * [[`a87007a4b6`](https://github.com/googleapis/cloud-debug-nodejs/commit/a87007a4b6)] - Use FUNCTION_NAME as service id on GCF (#274) (Matthew Loring) [#274](https://github.com/googleapis/cloud-debug-nodejs/pull/274)
  * [[`d3994f8959`](https://github.com/googleapis/cloud-debug-nodejs/commit/d3994f8959)] - Use service name as debuggee id on gke (#275) (Matthew Loring) [#275](https://github.com/googleapis/cloud-debug-nodejs/pull/275)

### Commits

* [[`9377a112df`](https://github.com/googleapis/cloud-debug-nodejs/commit/9377a112df)] - disableable assertions (#272) (Ali Ijaz Sheikh) [#272](https://github.com/googleapis/cloud-debug-nodejs/pull/272)
* [[`d3994f8959`](https://github.com/googleapis/cloud-debug-nodejs/commit/d3994f8959)] - Use service name as debuggee id on gke (#275) (Matthew Loring) [#275](https://github.com/googleapis/cloud-debug-nodejs/pull/275)
* [[`a87007a4b6`](https://github.com/googleapis/cloud-debug-nodejs/commit/a87007a4b6)] - Use FUNCTION_NAME as service id on GCF (#274) (Matthew Loring) [#274](https://github.com/googleapis/cloud-debug-nodejs/pull/274)
* [[`37d7745a67`](https://github.com/googleapis/cloud-debug-nodejs/commit/37d7745a67)] - include variables from outer scopes (#271) (Ali Ijaz Sheikh)
* [[`adcf3aec84`](https://github.com/googleapis/cloud-debug-nodejs/commit/adcf3aec84)] - Avoid repeated indexOf checks in tests (#273) (Matthew Loring) [#273](https://github.com/googleapis/cloud-debug-nodejs/pull/273)
* [[`53562ccc89`](https://github.com/googleapis/cloud-debug-nodejs/commit/53562ccc89)] - Update truncated object message (#269) (Matthew Loring) [#269](https://github.com/googleapis/cloud-debug-nodejs/pull/269)
* [[`7e2bc4fec7`](https://github.com/googleapis/cloud-debug-nodejs/commit/7e2bc4fec7)] - Indicate breakpoint expiration using the refers_to field (#268) (Matthew Loring) [#268](https://github.com/googleapis/cloud-debug-nodejs/pull/268)
* [[`14fee8277e`](https://github.com/googleapis/cloud-debug-nodejs/commit/14fee8277e)] - improve message for allowExpressions=false (#270) (Ali Ijaz Sheikh)
* [[`e2af53533b`](https://github.com/googleapis/cloud-debug-nodejs/commit/e2af53533b)] - start testing against Node 8 (#267) (Ali Ijaz Sheikh)
* [[`6956da821b`](https://github.com/googleapis/cloud-debug-nodejs/commit/6956da821b)] - stringify sourceContext before concat (#265) (Ali Ijaz Sheikh)
* [[`e7f15f5f56`](https://github.com/googleapis/cloud-debug-nodejs/commit/e7f15f5f56)] - add note about scopes on GKE (#264) (Ali Ijaz Sheikh)
* [[`8571d8544f`](https://github.com/googleapis/cloud-debug-nodejs/commit/8571d8544f)] - Specify test-only client version in test debugger (#262) (Matthew Loring) [#262](https://github.com/googleapis/cloud-debug-nodejs/pull/262)

## 2017-05-15, Version 2.0.0 (Experimental), @matthewloring

### Notable changes

This release drops support for versions of Node.js <4.

**Semver Major**

  * [[`8a119de64f`](https://github.com/googleapis/cloud-debug-nodejs/commit/8a119de64f)] - Update deps, drop support for 0.12 (#258) (Matthew Loring) [#258](https://github.com/googleapis/cloud-debug-nodejs/pull/258)

### Commits

* [[`0045ad5702`](https://github.com/googleapis/cloud-debug-nodejs/commit/0045ad5702)] - Add test notifications to travis (#261) (Matthew Loring) [#261](https://github.com/googleapis/cloud-debug-nodejs/pull/261)
* [[`5f45dbf2c6`](https://github.com/googleapis/cloud-debug-nodejs/commit/5f45dbf2c6)] - Avoid retries in e2e tests (#260) (Matthew Loring) [#260](https://github.com/googleapis/cloud-debug-nodejs/pull/260)
* [[`8a119de64f`](https://github.com/googleapis/cloud-debug-nodejs/commit/8a119de64f)] - Update deps, drop support for 0.12 (#258) (Matthew Loring) [#258](https://github.com/googleapis/cloud-debug-nodejs/pull/258)
* [[`022d1ba5cb`](https://github.com/googleapis/cloud-debug-nodejs/commit/022d1ba5cb)] - Add yarn.lock (#257) (Matthew Loring) [#257](https://github.com/googleapis/cloud-debug-nodejs/pull/257)
* [[`4360f88e6a`](https://github.com/googleapis/cloud-debug-nodejs/commit/4360f88e6a)] - drop dependency on dummy counter module (#256) (Ali Ijaz Sheikh)

## 2017-03-14, Version 1.0.0 (Experimental), @dominicdkramer

### Semver-major changes

* Evaluation of expressions is no longer allowed by default.  It can be enabled using the `allowExpressions` configuration option.

### Commits

* [[`3256eed494`](https://github.com/googleapis/cloud-debug-nodejs/commit/3256eed494)] - Update options in README (#249) (Matthew Loring) [#249](https://github.com/googleapis/cloud-debug-nodejs/pull/249)
* [[`36a0c2c012`](https://github.com/googleapis/cloud-debug-nodejs/commit/36a0c2c012)] - Add allowExpressions option (#244) (Matthew Loring) [#244](https://github.com/googleapis/cloud-debug-nodejs/pull/244)
* [[`48a9952ec0`](https://github.com/googleapis/cloud-debug-nodejs/commit/48a9952ec0)] - Report FUNCTION_NAME as the description (#247) (Ali Ijaz Sheikh)
* [[`cfc4f3fedf`](https://github.com/googleapis/cloud-debug-nodejs/commit/cfc4f3fedf)] - Relax configuration rules for agent (#245) (Matthew Loring) [#245](https://github.com/googleapis/cloud-debug-nodejs/pull/245)
* [[`8358f670e2`](https://github.com/googleapis/cloud-debug-nodejs/commit/8358f670e2)] - Remove unused dependencies (#246) (Matthew Loring) [#246](https://github.com/googleapis/cloud-debug-nodejs/pull/246)
* [[`6615823884`](https://github.com/googleapis/cloud-debug-nodejs/commit/6615823884)] - Reduce test loudness (#243) (Ali Ijaz Sheikh)
* [[`52b5bd3f52`](https://github.com/googleapis/cloud-debug-nodejs/commit/52b5bd3f52)] - deal with source-context read errors (#242) (Ali Ijaz Sheikh)
* [[`ce7ce0bbe9`](https://github.com/googleapis/cloud-debug-nodejs/commit/ce7ce0bbe9)] - improve normalizeConfig test (#241) (Ali Ijaz Sheikh)
* [[`21a8f5accf`](https://github.com/googleapis/cloud-debug-nodejs/commit/21a8f5accf)] - merge configs using a deep copy (#240) (Ali Ijaz Sheikh)
* [[`75974f56d5`](https://github.com/googleapis/cloud-debug-nodejs/commit/75974f56d5)] - Document minorVersion_ as an internal property (#239) (Ali Ijaz Sheikh)


## 2017-02-08, Version 0.10.2 (Experimental), @ofrobots

This release fixes an issue with being able to debug applications on AppEngine
Flexible.

### Commits

* [[`f651b8e776`](https://github.com/googleapis/cloud-debug-nodejs/commit/f651b8e776)] - provide minorversion label on AppEngine (#237) (Ali Ijaz Sheikh)
* [[`683448ceb4`](https://github.com/googleapis/cloud-debug-nodejs/commit/683448ceb4)] - update the logger tag (#236) (Ali Ijaz Sheikh)

## 2017-02-07, Version 0.10.1 (Experimental), @ofrobots

This module has been renamed to `@google-cloud/debug-agent` with this release.
This is a semver-major release with a few behaviour changes summarized below.

### Semver-major changes

* Remove undocumented env. vars.: `GCLOUD_DIAGNOSTICS_CONFIG`, `GCLOUD_DEBUG_DISABLE` (#184) and `GCLOUD_DEBUG_REPO_APP_PATH` (#186).
* This module now uses the same authentication code as [google-cloud-node](https://github.com/googleapis/google-cloud-node) API libraries. This changes the precedence of accepting auth credentials via `config.credentials` vs. `config.keyFileName` vs. the environment variable `GOOGLE_APPLICATION_CREDENTIALS`. (#190)
* Fix precedence of how we acquire the projectId. Previously we would prefer the projectId acquired automatically over the user-provided projectId. This has been reversed to make it less surprising to users. (#193)
* The agent no longer requires `cloud-platform` scope in order to operate. (#211)

### Commits

* [[`91e4b50e14`](https://github.com/googleapis/cloud-debug-nodejs/commit/91e4b50e14)] - upgrade to @google-cloud/common@0.12.0 to lose grpc dependency (#234) (Ali Ijaz Sheikh)
* [[`82e0ac52f2`](https://github.com/googleapis/cloud-debug-nodejs/commit/82e0ac52f2)] - undo version change to be able to publish properly (#233) (Ali Ijaz Sheikh)
* [[`66c0cf7a4e`](https://github.com/googleapis/cloud-debug-nodejs/commit/66c0cf7a4e)] - 0.10.0 Release Proposal (#232) (Ali Ijaz Sheikh)
* [[`b88548717a`](https://github.com/googleapis/cloud-debug-nodejs/commit/b88548717a)] - Increase timeout in system test (#231) (Ali Ijaz Sheikh)
* [[`61e21fb260`](https://github.com/googleapis/cloud-debug-nodejs/commit/61e21fb260)] - Rename module to @google-cloud/debug-agent (#229) (Ali Ijaz Sheikh)
* [[`8d7bdf6939`](https://github.com/googleapis/cloud-debug-nodejs/commit/8d7bdf6939)] - ***Revert*** "Temporarily stop building Node 7 on Windows" (#230)" (Ali Ijaz Sheikh)
* [[`7cbee73256`](https://github.com/googleapis/cloud-debug-nodejs/commit/7cbee73256)] - Get rid of module returning a constructor (#228) (Ali Ijaz Sheikh)
* [[`fdbbea55ed`](https://github.com/googleapis/cloud-debug-nodejs/commit/fdbbea55ed)] - Describe enabling Debugging API access scopes for GCE instances in README (#224) (Kelvin Jin) [#224](https://github.com/googleapis/cloud-debug-nodejs/pull/224)
* [[`1e8e6bc180`](https://github.com/googleapis/cloud-debug-nodejs/commit/1e8e6bc180)] - **test**: reduce dependence on repo layout (#227) (Ali Ijaz Sheikh)
* [[`daf015f974`](https://github.com/googleapis/cloud-debug-nodejs/commit/daf015f974)] - **test**: reduce dependence on repo layout (#225) (Ali Ijaz Sheikh)
* [[`04103e525a`](https://github.com/googleapis/cloud-debug-nodejs/commit/04103e525a)] - Fix bugs in findScripts (#223) (Ali Ijaz Sheikh)
* [[`cc29b29a8e`](https://github.com/googleapis/cloud-debug-nodejs/commit/cc29b29a8e)] - improve error stack traces in v8debugapi.js (#222) (Ali Ijaz Sheikh)
* [[`f1faef608f`](https://github.com/googleapis/cloud-debug-nodejs/commit/f1faef608f)] - Also try to detect serviceContext from Flex environment variables (#221) (Ali Ijaz Sheikh)
* [[`a00ce2ae45`](https://github.com/googleapis/cloud-debug-nodejs/commit/a00ce2ae45)] - Make all tests runnable together (#218) (Kelvin Jin) [#218](https://github.com/googleapis/cloud-debug-nodejs/pull/218)
* [[`474c2dc99c`](https://github.com/googleapis/cloud-debug-nodejs/commit/474c2dc99c)] - Remove misleading arguments/locals message (#220) (Cristian Cavalli)
* [[`944c1d582f`](https://github.com/googleapis/cloud-debug-nodejs/commit/944c1d582f)] - Update README markdown (#219) (Cristian Cavalli)
* [[`d2d1d214e2`](https://github.com/googleapis/cloud-debug-nodejs/commit/d2d1d214e2)] - Removed dependency on @google/cloud-diagnostics-common (#215) (Kelvin Jin) [#215](https://github.com/googleapis/cloud-debug-nodejs/pull/215)
* [[`90be573b48`](https://github.com/googleapis/cloud-debug-nodejs/commit/90be573b48)] - Test success_on_timeout behavior (#217) (Matthew Loring) [#217](https://github.com/googleapis/cloud-debug-nodejs/pull/217)
* [[`b5c29105ad`](https://github.com/googleapis/cloud-debug-nodejs/commit/b5c29105ad)] - Move some tests out of test/standalone (#214) (Kelvin Jin) [#214](https://github.com/googleapis/cloud-debug-nodejs/pull/214)
* [[`a28d719325`](https://github.com/googleapis/cloud-debug-nodejs/commit/a28d719325)] - Use mocha for end-to-end tests (#212) (Kelvin Jin) [#212](https://github.com/googleapis/cloud-debug-nodejs/pull/212)
* [[`c48c7dbbfc`](https://github.com/googleapis/cloud-debug-nodejs/commit/c48c7dbbfc)] - fix stale code/test from test-controller (#213) (Ali Ijaz Sheikh)
* [[`cebcb69b21`](https://github.com/googleapis/cloud-debug-nodejs/commit/cebcb69b21)] - Add Debugger API to test/ and changed E2E tests to use them (#208) (Kelvin Jin) [#208](https://github.com/googleapis/cloud-debug-nodejs/pull/208)
* [[`9b80c077e2`](https://github.com/googleapis/cloud-debug-nodejs/commit/9b80c077e2)] - use correct auth scopes (#211) (Ali Ijaz Sheikh)
* [[`e5d9eb9b51`](https://github.com/googleapis/cloud-debug-nodejs/commit/e5d9eb9b51)] - start using gcp-metadata for metadata queries (#210) (Ali Ijaz Sheikh)
* [[`5e3a0eff8a`](https://github.com/googleapis/cloud-debug-nodejs/commit/5e3a0eff8a)] - **debuglet**: stop can only be called on running agents (#209) (Ali Ijaz Sheikh)
* [[`a680d8706e`](https://github.com/googleapis/cloud-debug-nodejs/commit/a680d8706e)] - fix flakiness in test-debuglet.js (#207) (Ali Ijaz Sheikh)
* [[`80cd5a18b9`](https://github.com/googleapis/cloud-debug-nodejs/commit/80cd5a18b9)] - Remove duplicate isDisabled logic from controller (#206) (Ali Ijaz Sheikh)
* [[`2ec17329fb`](https://github.com/googleapis/cloud-debug-nodejs/commit/2ec17329fb)] - Change argument order in updateBreakpoint (#204) (Kelvin Jin)
* [[`b19b32d420`](https://github.com/googleapis/cloud-debug-nodejs/commit/b19b32d420)] - controller API requires Debuggee.description (#205) (Ali Ijaz Sheikh)
* [[`03f4b97596`](https://github.com/googleapis/cloud-debug-nodejs/commit/03f4b97596)] - Change e2e tests to use native Promises (#201) (Kelvin Jin) [#201](https://github.com/googleapis/cloud-debug-nodejs/pull/201)
* [[`dbff4dc0ee`](https://github.com/googleapis/cloud-debug-nodejs/commit/dbff4dc0ee)] - Move debuggee agent logic to agent/ (#203) (Ali Ijaz Sheikh)
* [[`416031f807`](https://github.com/googleapis/cloud-debug-nodejs/commit/416031f807)] - Move initConfig logic to debuglet (#202) (Ali Ijaz Sheikh)
* [[`30bd5288f7`](https://github.com/googleapis/cloud-debug-nodejs/commit/30bd5288f7)] - creds accepted in options only now (#200) (Ali Ijaz Sheikh)
* [[`b5b691fca0`](https://github.com/googleapis/cloud-debug-nodejs/commit/b5b691fca0)] - move config to src/agent and add jsdocs (#196) (Ali Ijaz Sheikh)
* [[`4dc2aa0eab`](https://github.com/googleapis/cloud-debug-nodejs/commit/4dc2aa0eab)] - Fill in unimplemented tests (#199) (Matthew Loring) [#199](https://github.com/googleapis/cloud-debug-nodejs/pull/199)
* [[`c580792c10`](https://github.com/googleapis/cloud-debug-nodejs/commit/c580792c10)] - Remove unimplementable test (#198) (Matthew Loring) [#198](https://github.com/googleapis/cloud-debug-nodejs/pull/198)
* [[`5fd09465c7`](https://github.com/googleapis/cloud-debug-nodejs/commit/5fd09465c7)] - Spelling (#197) (Matthew Loring) [#197](https://github.com/googleapis/cloud-debug-nodejs/pull/197)
* [[`225e7db1d5`](https://github.com/googleapis/cloud-debug-nodejs/commit/225e7db1d5)] - Refactor debuggee state out of controller and make Controller a ServiceObject (#195) (Ali Ijaz Sheikh)
* [[`a807998261`](https://github.com/googleapis/cloud-debug-nodejs/commit/a807998261)] - move business logic from controller service to the debuglet (#194) (Ali Ijaz Sheikh)
* [[`f7de637af4`](https://github.com/googleapis/cloud-debug-nodejs/commit/f7de637af4)] - fix precedence for where the projectId is acquired from (#193) (Ali Ijaz Sheikh)
* [[`638f902287`](https://github.com/googleapis/cloud-debug-nodejs/commit/638f902287)] - refactorings (Ali Ijaz Sheikh)
* [[`c5d3d226c9`](https://github.com/googleapis/cloud-debug-nodejs/commit/c5d3d226c9)] - switch to using @google-cloud/common (#190) (Ali Ijaz Sheikh)
* [[`75b08e90cf`](https://github.com/googleapis/cloud-debug-nodejs/commit/75b08e90cf)] - Temporarily stop building Node 7 on Windows (Ali Ijaz Sheikh)
* [[`c5eafdd09f`](https://github.com/googleapis/cloud-debug-nodejs/commit/c5eafdd09f)] - Update travis config to use trusty (#191) (Ali Ijaz Sheikh)
* [[`d3d648ee3f`](https://github.com/googleapis/cloud-debug-nodejs/commit/d3d648ee3f)] - Move agent code into an agent/ directory (#189) (Ali Ijaz Sheikh)
* [[`4c37f32fc5`](https://github.com/googleapis/cloud-debug-nodejs/commit/4c37f32fc5)] - listBreakpoint querystring encoding was incorrect (#188) (Ali Ijaz Sheikh)
* [[`85573b29c3`](https://github.com/googleapis/cloud-debug-nodejs/commit/85573b29c3)] - add system test for the debuglet api (#187) (Ali Ijaz Sheikh)
* [[`35e303938e`](https://github.com/googleapis/cloud-debug-nodejs/commit/35e303938e)] - Remove relative repository env var (#186) (Matthew Loring) [#186](https://github.com/googleapis/cloud-debug-nodejs/pull/186)
* [[`94fd29912c`](https://github.com/googleapis/cloud-debug-nodejs/commit/94fd29912c)] - AUTHORS file (#185) (Matthew Loring) [#185](https://github.com/googleapis/cloud-debug-nodejs/pull/185)
* [[`69ca4e8ade`](https://github.com/googleapis/cloud-debug-nodejs/commit/69ca4e8ade)] - Remove unncessary environment variables (#184) (Matthew Loring) [#184](https://github.com/googleapis/cloud-debug-nodejs/pull/184)
* [[`e410c36707`](https://github.com/googleapis/cloud-debug-nodejs/commit/e410c36707)] - API changes bring us closer to `google-cloud` (#180) (Ali Ijaz Sheikh)
* [[`d6cb2fbfae`](https://github.com/googleapis/cloud-debug-nodejs/commit/d6cb2fbfae)] - Also test against Node 7 on AppVeyor (#182) (Ali Ijaz Sheikh)
* [[`2383d08452`](https://github.com/googleapis/cloud-debug-nodejs/commit/2383d08452)] - Switch from findit to findit2 (#183) (Ali Ijaz Sheikh)
* [[`e5637c787b`](https://github.com/googleapis/cloud-debug-nodejs/commit/e5637c787b)] - fix race condition with log points (#181) (Ali Ijaz Sheikh)


## 2016-11-29, Version 0.9.1 (Experimental), @matthewloring

### Notable changes

**UI:**
  * [[`d370e20e1e`](https://github.com/googleapis/cloud-debug-nodejs/commit/d370e20e1e)] - Prioritize capturing expressions (#162) (Dominic Kramer)
  * [[`b89e31cb5f`](https://github.com/googleapis/cloud-debug-nodejs/commit/b89e31cb5f)] - Evaluated expressions respect capture.maxProperties (#174) (Dominic Kramer)
  * [[`36d9a7b980`](https://github.com/googleapis/cloud-debug-nodejs/commit/36d9a7b980)] - improve UX for truncated objects properties (#175) (Ali Ijaz Sheikh)

### Commits

* [[`afc6edd7c7`](https://github.com/googleapis/cloud-debug-nodejs/commit/afc6edd7c7)] - Add badges + update dependencies (Matt Loring)
* [[`d666c99fb1`](https://github.com/googleapis/cloud-debug-nodejs/commit/d666c99fb1)] - Now status messages include config values (#177) (Dominic Kramer)
* [[`36d9a7b980`](https://github.com/googleapis/cloud-debug-nodejs/commit/36d9a7b980)] - improve UX for truncated objects properties (#175) (Ali Ijaz Sheikh)
* [[`9b6961d8d0`](https://github.com/googleapis/cloud-debug-nodejs/commit/9b6961d8d0)] - Begin testing against v7 on travis (#176) (Matthew Loring) [#176](https://github.com/googleapis/cloud-debug-nodejs/pull/176)
* [[`b89e31cb5f`](https://github.com/googleapis/cloud-debug-nodejs/commit/b89e31cb5f)] - Evaluated expressions respect capture.maxProperties (#174) (Dominic Kramer)
* [[`2a131c228f`](https://github.com/googleapis/cloud-debug-nodejs/commit/2a131c228f)] - Correct the status shown if maxDataSize is reached (#173) (Dominic Kramer)
* [[`d370e20e1e`](https://github.com/googleapis/cloud-debug-nodejs/commit/d370e20e1e)] - Prioritize capturing expressions (#162) (Dominic Kramer)
* [[`398d04a2eb`](https://github.com/googleapis/cloud-debug-nodejs/commit/398d04a2eb)] - Update the gen-repo-info-file command (#172) (Ali Ijaz Sheikh)

## 2016-11-03, Version 0.9.0 (Experimental), @dominickramer

### Notable changes

**sourcemap support:**
  * [[`f8bb4dc16d`](https://github.com/googleapis/cloud-debug-nodejs/commit/f8bb4dc16d)] - Add improved support for transpiled code (#159) (Dominic Kramer)

**configuration:**
  * [[`a131faf7a8`](https://github.com/googleapis/cloud-debug-nodejs/commit/a131faf7a8)] - Add the start() Method and the Ability to Specify the Service Name/Version in the Debug Config (#167) (Dominic Kramer)
  * [[`5b35412827`](https://github.com/googleapis/cloud-debug-nodejs/commit/5b35412827)] - Added keyFilename/credentials to config object (#169) (Kelvin Jin) [#169](https://github.com/googleapis/cloud-debug-nodejs/pull/169)

### Commits

* [[`5b35412827`](https://github.com/googleapis/cloud-debug-nodejs/commit/5b35412827)] - Added keyFilename/credentials to config object (#169) (Kelvin Jin) [#169](https://github.com/googleapis/cloud-debug-nodejs/pull/169)
* [[`71665343c2`](https://github.com/googleapis/cloud-debug-nodejs/commit/71665343c2)] - Add a configuration section to the README (#170) (Dominic Kramer)
* [[`cd1f579c9f`](https://github.com/googleapis/cloud-debug-nodejs/commit/cd1f579c9f)] - ***Revert*** "Promote to Beta in README.md (#161)" (#168)" (Dominic Kramer)
* [[`a131faf7a8`](https://github.com/googleapis/cloud-debug-nodejs/commit/a131faf7a8)] - Add the start() Method and the Ability to Specify the Service Name/Version in the Debug Config (#167) (Dominic Kramer)
* [[`f8bb4dc16d`](https://github.com/googleapis/cloud-debug-nodejs/commit/f8bb4dc16d)] - Add improved support for transpiled code (#159) (Dominic Kramer)
* [[`fd05077c2a`](https://github.com/googleapis/cloud-debug-nodejs/commit/fd05077c2a)] - Fixes spelling error (Strackdriver => Stackdriver) (#165) (Jason) [#165](https://github.com/googleapis/cloud-debug-nodejs/pull/165)
* [[`8b5550b75b`](https://github.com/googleapis/cloud-debug-nodejs/commit/8b5550b75b)] - Promote to Beta in README.md (#161) (Ali Ijaz Sheikh)
* [[`66e57868c4`](https://github.com/googleapis/cloud-debug-nodejs/commit/66e57868c4)] - Avoid doubly expiring breakpoints (#157) (Matthew Loring) [#157](https://github.com/googleapis/cloud-debug-nodejs/pull/157)
* [[`7cfffa6d81`](https://github.com/googleapis/cloud-debug-nodejs/commit/7cfffa6d81)] - Reduce flakiness caused by short timeout (#158) (Matthew Loring) [#158](https://github.com/googleapis/cloud-debug-nodejs/pull/158)
* [[`9f0e2fdd92`](https://github.com/googleapis/cloud-debug-nodejs/commit/9f0e2fdd92)] - Add debuggee name to the re-register log message (#154) (Dominic Kramer) [#154](https://github.com/googleapis/cloud-debug-nodejs/pull/154)

## 2016-10-03, Version 0.8.5 (Experimental), @matthewloring

### Commits

* [[`ca08055108`](https://github.com/googleapis/cloud-debug-nodejs/commit/ca08055108)] - Update diagnostics common (#155) (Matthew Loring) [#155](https://github.com/googleapis/cloud-debug-nodejs/pull/155)

## 2016-09-07, Version 0.8.4 (Experimental), @matthewloring

### Notable changes

**bug fixes**:
  * [[`edcfb043a9`](https://github.com/googleapis/cloud-debug-nodejs/commit/edcfb043a9)] - Add ScopeMirror traversal to state.js (#142) (Cristian Cavalli)

### Commits

* [[`198fb1ec9a`](https://github.com/googleapis/cloud-debug-nodejs/commit/198fb1ec9a)] - Make E2E tests ScopeMirror aware (#149) (Cristian Cavalli)
* [[`edcfb043a9`](https://github.com/googleapis/cloud-debug-nodejs/commit/edcfb043a9)] - Add ScopeMirror traversal to state.js (#142) (Cristian Cavalli)
* [[`ab7273dc84`](https://github.com/googleapis/cloud-debug-nodejs/commit/ab7273dc84)] - Update acorn/mocha dependencies (#144) (Matthew Loring) [#144](https://github.com/googleapis/cloud-debug-nodejs/pull/144)
* [[`2ec5d1cd08`](https://github.com/googleapis/cloud-debug-nodejs/commit/2ec5d1cd08)] - Fix typo in readme (#145) (Matthew Loring)
* [[`df9276b63a`](https://github.com/googleapis/cloud-debug-nodejs/commit/df9276b63a)] - remove preview from gcloud app (#141) (Justin Beckwith)

## 2016-06-14, Version 0.8.3 (Experimental), @matthewloring

### Notable changes

**configuration**:
  * [[`4aab7bfc1a`](https://github.com/googleapis/cloud-debug-nodejs/commit/4aab7bfc1a)] - Configurable throttling for log points (Matt Loring)

**watch expressions**:
  * [[`251e8aaaf7`](https://github.com/googleapis/cloud-debug-nodejs/commit/251e8aaaf7)] - Allow ES6 conditions and watches (Ali Ijaz Sheikh)

### Commits

* [[`0b98240eb2`](https://github.com/googleapis/cloud-debug-nodejs/commit/0b98240eb2)] - Documentation updates (Ali Ijaz Sheikh)
* [[`4d2dfffa79`](https://github.com/googleapis/cloud-debug-nodejs/commit/4d2dfffa79)] - Get e2e tests on travis (Matt Loring)
* [[`1e083488f6`](https://github.com/googleapis/cloud-debug-nodejs/commit/1e083488f6)] - Resume logging after log quota is hit (Matt Loring)
* [[`a26278e702`](https://github.com/googleapis/cloud-debug-nodejs/commit/a26278e702)] - Prevent calls to deleted breakpoint listeners (Matt Loring)
* [[`251e8aaaf7`](https://github.com/googleapis/cloud-debug-nodejs/commit/251e8aaaf7)] - Allow ES6 conditions and watches (Ali Ijaz Sheikh)
* [[`49f5d9579c`](https://github.com/googleapis/cloud-debug-nodejs/commit/49f5d9579c)] - Add LOGPOINT prefix to log point messages (Matt Loring)
* [[`4aab7bfc1a`](https://github.com/googleapis/cloud-debug-nodejs/commit/4aab7bfc1a)] - Configurable throttling for log points (Matt Loring)
* [[`fedd5f4ec9`](https://github.com/googleapis/cloud-debug-nodejs/commit/fedd5f4ec9)] - Special case array length reporting (Matt Loring)
* [[`8c0d15fa03`](https://github.com/googleapis/cloud-debug-nodejs/commit/8c0d15fa03)] - Clarify module loading order in readme (Matt Loring)
* [[`fbb419503b`](https://github.com/googleapis/cloud-debug-nodejs/commit/fbb419503b)] - Merge pull request #131 from bradabrams/patch-1 (Justin Beckwith)
* [[`d2a6ac1a53`](https://github.com/googleapis/cloud-debug-nodejs/commit/d2a6ac1a53)] - Update README.md (Brad Abrams)
* [[`da40e94f03`](https://github.com/googleapis/cloud-debug-nodejs/commit/da40e94f03)] - support log statements with no expressions (Matt Loring)
* [[`fbd31fe627`](https://github.com/googleapis/cloud-debug-nodejs/commit/fbd31fe627)] - Rename Managed VMs to Flexible Environment (#129) (Steren)
* [[`58fe3f3d45`](https://github.com/googleapis/cloud-debug-nodejs/commit/58fe3f3d45)] - Fixes crash if gcloud project isn't identified (Matt Loring)
* [[`594aa68c34`](https://github.com/googleapis/cloud-debug-nodejs/commit/594aa68c34)] - Change language to use snapshot instead of breakpoint (Matt Loring)
* [[`b1027d2273`](https://github.com/googleapis/cloud-debug-nodejs/commit/b1027d2273)] - Add registration retries (Matt Loring)
* [[`222209b450`](https://github.com/googleapis/cloud-debug-nodejs/commit/222209b450)] - Report file and line number on invalid bp position (Matt Loring)

## 2016-05-13, Version 0.8.2 (Experimental), @matthewloring

### Notable changes

**log points**:
  * [[`61846c5062`](https://github.com/googleapis/cloud-debug-nodejs/commit/61846c5062)] - Add support for log points (Matt Loring)

**configuration**:
  * [[`c7e157226b`](https://github.com/googleapis/cloud-debug-nodejs/commit/c7e157226b)] - Add config and more descriptive names on GCE/GKE (Matt Loring)

### Commits

* [[`240a74858e`](https://github.com/googleapis/cloud-debug-nodejs/commit/240a74858e)] - Correct log formatting for non-primitives (Matt Loring)
* [[`58006f0a00`](https://github.com/googleapis/cloud-debug-nodejs/commit/58006f0a00)] - Fix breakpoint format on large variables (Matt Loring)
* [[`61846c5062`](https://github.com/googleapis/cloud-debug-nodejs/commit/61846c5062)] - Add support for log points (Matt Loring)
* [[`5a39240e7c`](https://github.com/googleapis/cloud-debug-nodejs/commit/5a39240e7c)] - Improve summarization of breakpoint capture (Matt Loring)
* [[`a67692df5c`](https://github.com/googleapis/cloud-debug-nodejs/commit/a67692df5c)] - exit 1 on test failure (Matt Loring)
* [[`c7e157226b`](https://github.com/googleapis/cloud-debug-nodejs/commit/c7e157226b)] - Add config and more descriptive names on GCE/GKE (Matt Loring)
* [[`3fcf3e86bb`](https://github.com/googleapis/cloud-debug-nodejs/commit/3fcf3e86bb)] - Remove e2e tests from travis (Matt Loring)
* [[`a48084b8c8`](https://github.com/googleapis/cloud-debug-nodejs/commit/a48084b8c8)] - Test debugger with cluster (Matt Loring)
* [[`430a8742a0`](https://github.com/googleapis/cloud-debug-nodejs/commit/430a8742a0)] - Update tests to use v2 debugger api (Matt Loring)
* [[`21ef3b20a4`](https://github.com/googleapis/cloud-debug-nodejs/commit/21ef3b20a4)] - Allow for unlimited data capture size (Matt Loring)
* [[`1f07e000ff`](https://github.com/googleapis/cloud-debug-nodejs/commit/1f07e000ff)] - Start windows CI runs (Matt Loring)

## 2016-04-26, Version 0.8.1 (Experimental), @matthewloring

### Commits

* [[`5573e84fc5`](https://github.com/googleapis/cloud-debug-nodejs/commit/5573e84fc5)] - Report unique ids when not on GCP (Matt Loring)
* [[`442e1bdcc0`](https://github.com/googleapis/cloud-debug-nodejs/commit/442e1bdcc0)] - Add support for Node.js v6 (Matt Loring)

## 2016-04-25, Version 0.8.0 (Experimental), @matthewloring

### Notable changes

**configuration**:
  * [[`af8aa79b65`](https://github.com/googleapis/cloud-debug-nodejs/commit/af8aa79b65)] - Rename source-contexts -> source-context (Matt Loring)

### Commits

* [[`26a5bd6a7f`](https://github.com/googleapis/cloud-debug-nodejs/commit/26a5bd6a7f)] - Update list breakpoint longpoll mechanism (Matt Loring)
* [[`6cc78e67d5`](https://github.com/googleapis/cloud-debug-nodejs/commit/6cc78e67d5)] - Add projectid label/omit default module (Matt Loring)
* [[`3a44bfd199`](https://github.com/googleapis/cloud-debug-nodejs/commit/3a44bfd199)] - Update agent version format (Matt Loring)
* [[`1db03bbc12`](https://github.com/googleapis/cloud-debug-nodejs/commit/1db03bbc12)] - Warn on debug logpoints (Matt Loring)
* [[`af8aa79b65`](https://github.com/googleapis/cloud-debug-nodejs/commit/af8aa79b65)] - Rename source-contexts -> source-context (Matt Loring)
* [[`338f9ab34c`](https://github.com/googleapis/cloud-debug-nodejs/commit/338f9ab34c)] - Fix typo in resolveMirrorProperty_ (Ali Ijaz Sheikh)
* [[`57d88a5936`](https://github.com/googleapis/cloud-debug-nodejs/commit/57d88a5936)] - test to ensure memeber names are valid (Ali Ijaz Sheikh)
* [[`291ef02d74`](https://github.com/googleapis/cloud-debug-nodejs/commit/291ef02d74)] - coerce mirror property names to strings (Ali Ijaz Sheikh)
* [[`7967cc949c`](https://github.com/googleapis/cloud-debug-nodejs/commit/7967cc949c)] - validate breakpoint schema in tests (Ali Ijaz Sheikh)
* [[`0dbf25c876`](https://github.com/googleapis/cloud-debug-nodejs/commit/0dbf25c876)] - defer breakpoint callback (Ali Ijaz Sheikh)
* [[`27692c1b11`](https://github.com/googleapis/cloud-debug-nodejs/commit/27692c1b11)] - Pin diagnostics common version (Matt Loring)

## 2016-04-18, Version 0.7.0 (Experimental), @matthewloring

### Notable changes

**configuration**:
  * [[`2bc75d8f18`](https://github.com/googleapis/cloud-debug-nodejs/commit/2bc75d8f18)] - GCLOUD_PROJECT instead of GCLOUD_PROJECT_NUM (Matt Loring)
  * [[`08fb68ce50`](https://github.com/googleapis/cloud-debug-nodejs/commit/08fb68ce50)] - Enable maxFrames config option (Matt Loring)
  * [[`14ac9e4abc`](https://github.com/googleapis/cloud-debug-nodejs/commit/14ac9e4abc)] - Enable maxExpandFrames config option (Matt Loring)

**performance**:
  * [[`d9f86a5f27`](https://github.com/googleapis/cloud-debug-nodejs/commit/d9f86a5f27)] - Speed up variable resolution ~10x on node 1.6+ (Matt Loring)

### Commits

* [[`2bc75d8f18`](https://github.com/googleapis/cloud-debug-nodejs/commit/2bc75d8f18)] - GCLOUD_PROJECT instead of GCLOUD_PROJECT_NUM (Matt Loring)
* [[`fd1f643c49`](https://github.com/googleapis/cloud-debug-nodejs/commit/fd1f643c49)] - Update README images (Matt Loring)
* [[`1169689eaa`](https://github.com/googleapis/cloud-debug-nodejs/commit/1169689eaa)] - Update dependencies (Matt Loring)
* [[`7f2010a156`](https://github.com/googleapis/cloud-debug-nodejs/commit/7f2010a156)] - Remove outstanding todo (Matt Loring)
* [[`06f5beafcc`](https://github.com/googleapis/cloud-debug-nodejs/commit/06f5beafcc)] - Formatting and comments for state.js (Matt Loring)
* [[`08fb68ce50`](https://github.com/googleapis/cloud-debug-nodejs/commit/08fb68ce50)] - Enable maxFrames config option (Matt Loring)
* [[`14ac9e4abc`](https://github.com/googleapis/cloud-debug-nodejs/commit/14ac9e4abc)] - Enable maxExpandFrames config option (Matt Loring)
* [[`82bb2b89f1`](https://github.com/googleapis/cloud-debug-nodejs/commit/82bb2b89f1)] - Store breakpoint id instead of breakpoint where possible (Matt Loring)
* [[`4828beee6c`](https://github.com/googleapis/cloud-debug-nodejs/commit/4828beee6c)] - Enable maxStringLength config option (Matt Loring)
* [[`c0f3350d7f`](https://github.com/googleapis/cloud-debug-nodejs/commit/c0f3350d7f)] - Display error for native properties/getters (Matt Loring)
* [[`215d748d14`](https://github.com/googleapis/cloud-debug-nodejs/commit/215d748d14)] - Only compute hash if no other uid available (Matt Loring)
* [[`d667fa646b`](https://github.com/googleapis/cloud-debug-nodejs/commit/d667fa646b)] - Remove TODO to use v8 as parser (Matt Loring)
* [[`3550675eff`](https://github.com/googleapis/cloud-debug-nodejs/commit/3550675eff)] - Only mark breakpoints done when api call succeeds (Matt Loring)
* [[`0d9a312cb5`](https://github.com/googleapis/cloud-debug-nodejs/commit/0d9a312cb5)] - Add performance test to monitor capture time (Matt Loring)
* [[`d9f86a5f27`](https://github.com/googleapis/cloud-debug-nodejs/commit/d9f86a5f27)] - Speed up variable resolution ~10x on node 1.6+ (Matt Loring)
* [[`2ba5bbd488`](https://github.com/googleapis/cloud-debug-nodejs/commit/2ba5bbd488)] - Removed event emitter from v8 debug api (Matt Loring)
* [[`8eadace06b`](https://github.com/googleapis/cloud-debug-nodejs/commit/8eadace06b)] - Add testing for map subtract (Matt Loring)
* [[`2ececd6e8f`](https://github.com/googleapis/cloud-debug-nodejs/commit/2ececd6e8f)] - Give proper type to execState (Matt Loring)
* [[`3fcc8fae0e`](https://github.com/googleapis/cloud-debug-nodejs/commit/3fcc8fae0e)] - Warn if malformed source-contexts is found (Matt Loring)
* [[`a782875532`](https://github.com/googleapis/cloud-debug-nodejs/commit/a782875532)] - Cleanup todos (Matt Loring)
* [[`a95b308b78`](https://github.com/googleapis/cloud-debug-nodejs/commit/a95b308b78)] - Test for source context (Matt Loring)
* [[`4de169b128`](https://github.com/googleapis/cloud-debug-nodejs/commit/4de169b128)] - Clean up coffeescript error messages (Matt Loring)
* [[`2d45b8ce97`](https://github.com/googleapis/cloud-debug-nodejs/commit/2d45b8ce97)] - Regression test for #50 on GH (Matt Loring)
* [[`df8b6f6bf0`](https://github.com/googleapis/cloud-debug-nodejs/commit/df8b6f6bf0)] - Regression test for #56 on GH (Matt Loring)
* [[`60ea5a00e0`](https://github.com/googleapis/cloud-debug-nodejs/commit/60ea5a00e0)] - Expand testing for invalid watch expressions (Matt Loring)
* [[`42277e65dc`](https://github.com/googleapis/cloud-debug-nodejs/commit/42277e65dc)] - Unify warnings for using v5.2 and <v0.12 (Matt Loring)
* [[`54c8a97c73`](https://github.com/googleapis/cloud-debug-nodejs/commit/54c8a97c73)] - Don't repeat frame arguments in frame locals (Matt Loring)
* [[`1c36ba5b66`](https://github.com/googleapis/cloud-debug-nodejs/commit/1c36ba5b66)] - Error message when agent is run with node 5.2 (Matt Loring)
* [[`d946f8715f`](https://github.com/googleapis/cloud-debug-nodejs/commit/d946f8715f)] - Update dev dependencies (Matt Loring)
* [[`df69fdad2f`](https://github.com/googleapis/cloud-debug-nodejs/commit/df69fdad2f)] - Improve debug test coverage (Matt Loring)
