/* 1 TESTS RELY ON THE PRECISE LINE NUMBERS IN THIS FILE */
/* 2*/ export interface Point {
  /* 3*/ x: number;
  /* 4*/ y: number;
/* 5*/ }
/* 6*/
/* 7*/ export function dist(pt1: Point, pt2: Point) {
  /* 8*/ const xdiff = pt1.x - pt2.x;
  /* 9*/ const ydiff = pt1.y - pt2.y;
  /*10*/ const pnorm1 = Math.abs(xdiff) + Math.abs(ydiff);
  /*11*/ const pnorm2 = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
  /*12*/ return {pnorm1, pnorm2};
/*13*/ }

/*
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
