// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["Console", "console"];

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "DOMInfo",
  "resource://spatialnavigation/DOMInfo.jsm");

const { ConsoleAPI } =
  Cu.import("resource://gre/modules/devtools/Console.jsm", {});

const LOG_LEVELS = [
  "all",      // Number.MIN_VALUE
  "debug",    // 2
  "log",      // 3
  "info",     // 3
  "trace",    // 3
  "timeEnd",  // 3
  "time",     // 3
  "group",    // 3
  "groupEnd", // 3
  "dir",      // 3
  "dirxml",   // 3
  "warn",     // 4
  "error",    // 5
  "off",      // Number.MAX_VALUE,
];

this.Console =
function Console(aPrefix) {
  ConsoleAPI.call(this, {
    prefix: `[SpatialNavigationB2G]${aPrefix?aPrefix:''} `,
    maxLogLevel: PrefObserver["loglevel"] || "off",
  });

  Object.defineProperties(this, {
    maxLogLevel: {
      get() {
        const loglevel = PrefObserver["loglevel"];
        if (LOG_LEVELS.indexOf(loglevel) !== -1) {
          return loglevel;
        }
        return "off";
      }
    },
    innerID: {
      get() { return getTopWindowID(); }
    }
  });

}
Console.prototype = Object.create(ConsoleAPI.prototype);

this.console = new Console();

////////////////////////////////////////////////////////////////////////////////
var topWindow = Cu.getWeakReference(null), topWindowID;
function getTopWindowID() {
  try {
    if (!topWindow.get()) {
      topWindow =
        Cu.getWeakReference(DOMInfo.getRootWindowOfProcess(null, true));
      topWindowID = getRootWindowId(topWindow.get());
    }
  } catch (e) {
    topWindowID = null;
  }
  return topWindowID;
}

function getRootWindowId(aWindow) {
  return aWindow && aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindowUtils)
                           .currentInnerWindowID;
}
