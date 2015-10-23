// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["StyleSheetsManager"];

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "ioService",
  "@mozilla.org/network/io-service;1", "nsIIOService");

XPCOMUtils.defineLazyServiceGetter(this, "sss",
  "@mozilla.org/content/style-sheet-service;1", "nsIStyleSheetService");

XPCOMUtils.defineLazyModuleGetter(this, "console",
  "resource://spatialnavigation/Console.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");

this.StyleSheetsManager = {
  get length() {  // return number of registered style sheets
    let cnt = 0;
    if (PrefObserver["enabled"]) {
      for (let type in registeredSheets) cnt += registeredSheets[type].length;
    }

    return cnt;
  },

  registerStyleSheet(aSpec, aType = AUTHOR_SHEET) {
    if (!(aType in registeredSheets)) return false;

    if (registerSheet(aSpec, aType)) {
      registeredSheets[aType].add(aSpec);
    }

    return true;
  },

  unregisterStyleSheet(aSpec, aType = AUTHOR_SHEET) {
    if (!(aType in registeredSheets)) return false;

    unregisterSheet(aSpec, aType);
    registeredSheets[aType].delete(aSpec);

    return true;
  },
};

////////////////////////////////////////////////////////////////////////////////
const {AGENT_SHEET, USER_SHEET, AUTHOR_SHEET} = Ci.nsIStyleSheetService;

const registeredSheets = {
  [AGENT_SHEET]: new Set(),
  [USER_SHEET]: new Set(),
  [AUTHOR_SHEET]: new Set(),
};

PrefObserver.on("enabled", function(aKind, val) {
  for (let type in registeredSheets) {
    for (let spec of registeredSheets[type]) {
      val ? registerSheet(spec, type) : unregisterSheet(spec, type);
    }
  }
});

function registerSheet(aSpec, aType) {
  let uri = ioService.newURI(aSpec, null, null);
  if (sss.sheetRegistered(uri, aType)) return false;

  console.log("Register CSS", uri.asciiSpec);
  let loaded = false;
  if (PrefObserver["enabled"]) {
    try {
      sss.loadAndRegisterSheet(uri, aType);
      loaded = true;
    } catch(e) {
      console.error("Exception : ", e, '->' , e.detail);
    }
  }

  return loaded;
}

function unregisterSheet(aSpec, aType) {
  let uri = ioService.newURI(aSpec, null, null);
  if (!sss.sheetRegistered(uri, aType)) return false;

  console.log("Unregister CSS", uri.asciiSpec);
  sss.unregisterSheet(uri, aType);

  return true;
}
