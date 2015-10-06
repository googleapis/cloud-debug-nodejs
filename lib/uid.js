/**        
 * Copyright 2015 Google Inc. All Rights Reserved.     
 *     
 * Licensed under the Apache License, Version 2.0 (the "License");     
 * you may not use this file except in compliance with the License.        
 * You may obtain a copy of the License at     
 *     
 *      http://www.apache.org/licenses/LICENSE-2.0     
 *     
 * Unless required by applicable law or agreed to in writing, software     
 * distributed under the License is distributed on an "AS IS" BASIS,       
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.        
 * See the License for the specific language governing permissions and     
 * limitations under the License.      
 */        
 'use strict';     
       
/**        
 * Find a unique id that can be used to identify this application to the       
 * cloud debug server. The UID may be computed by either looking at the GAE
 * or GKE environment (cheap) or, if running locally using a hash of the
 * contents of your js files.
 *
 * @param {string} baseDir top level with package.json     
 * @param {string} hash a hash of filesystem rooted at the working directory      
 */        
module.exports.get = function (hash) {
  // Running on Google App Engine?
  if (process.env.GAE_MINOR_VERSION) {
    return 'GAE-' + process.env.GAE_MINOR_VERSION;
  }

  // Running on Google Container Engine?
  // TODO: check the Kubernetes API

  return hash;   
};
