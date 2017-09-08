import * as estree from 'estree'

import * as apiTypes from '../types/api-types';
import * as v8Types from '../types/v8-types';

export class V8BreakpointData {
  constructor(
      public apiBreakpoint: apiTypes.Breakpoint,
      public v8Breakpoint: v8Types.BreakPoint,
      public parsedCondition: estree.Node,
      // TODO: The code in this method assumes that `compile` exists.  Verify
      // that is correct.
      // TODO: Update this so that `null|` is not needed for `compile`.
      public compile: null|((src: string) => string)) {}
}
