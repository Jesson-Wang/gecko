// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["Direction"];

const { utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");

this.Direction = {
  left: {
    get value()        { return "left"; },
    get isVertical()   { return false; },
    get isHorizontal() { return true; },
    toString()         { return this.value; },
    toJSON()           { return this.value; }
  },
  right: {
    get value()        { return "right"; },
    get isVertical()   { return false; },
    get isHorizontal() { return true; },
    toString()         { return this.value; },
    toJSON()           { return this.value; }
  },
  up: {
    get value()        { return "up"; },
    get isVertical()   { return true; },
    get isHorizontal() { return false; },
    toString()         { return this.value; },
    toJSON()           { return this.value; }
  },
  down: {
    get value()        { return "down"; },
    get isVertical()   { return true; },
    get isHorizontal() { return false; },
    toString()         { return this.value; },
    toJSON()           { return this.value; }
  },
  fromKey(aKey) {
    switch (aKey) {
      case PrefObserver["keyCodeLeft"]:
        return this.left;
      case PrefObserver["keyCodeRight"]:
        return this.right;
      case PrefObserver["keyCodeUp"]:
        return this.up;
      case PrefObserver["keyCodeDown"]:
        return this.down;
    }
    return null;
  }
}
