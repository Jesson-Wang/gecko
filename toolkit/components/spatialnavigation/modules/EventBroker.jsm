// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [];

const { utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Navigator",
  "resource://spatialnavigation/Navigator.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "console",
  "resource://spatialnavigation/Console.jsm");

////////////////////////////////////////////////////////////////////////////////
Cu.import("resource://spatialnavigation/InputManager.jsm");

var ignoreUserInput;

InputManager.on("userinput", (aKind, aKey) => {
  ignoreUserInput = Navigator.forwardInputIfRequired(aKey);
});

InputManager.on("userinput:ok", (aKind, aFocusedElem) => {
  if (ignoreUserInput || !aFocusedElem) return false;

  if (Navigator.click(aFocusedElem)) {
    dropUserInput();
  }
});

InputManager.on("userinput:direction", (aKind, aDirection) => {
  if (ignoreUserInput) return;

  if (Navigator.moveToward(aDirection)) {
    dropUserInput();
  }
});

function dropUserInput() {
  InputManager.stopPropagation();
  InputManager.preventDefault();
}

////////////////////////////////////////////////////////////////////////////////
Cu.import("resource://spatialnavigation/IPC.jsm");

IPC.on("movefocus:fromchild", (akind, aIframe, aRectFrom, aDirection) =>
  Navigator.moveFocusFromChild(aIframe, aRectFrom, aDirection));

IPC.on("movefocus:fromparent", (aKind, aTopWindow, aRectFrom, aDirection) =>
  Navigator.moveFocusFromParent(aTopWindow, aRectFrom, aDirection));
