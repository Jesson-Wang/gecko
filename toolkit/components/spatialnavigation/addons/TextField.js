// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Direction",
  "resource://spatialnavigation/Direction.jsm");

on("premove",
  function TextFieldPreMove(aKind, aFocused, aDirection) {
    if (!isTarget(aFocused)) return;

    // If there is a text selection, remain in the element.
    if (aFocused.selectionEnd - aFocused.selectionStart != 0) {
      stopNavigation();
      return;
    }

    // If there is no text, there is nothing special to do.
    if (aFocused.textLength > 0) {
      if (aDirection === Direction.right || aDirection === Direction.down) {
        // We are moving forward into the document.
        if (aFocused.textLength != aFocused.selectionEnd) {
          stopNavigation();
        }
      } else if (aFocused.selectionStart != 0) {
        stopNavigation();
      }
    }
  }
);

on("postfocus", function TextFieldPostFocus(aKind, aFocused) {
  if (!isTarget(aFocused)) return;

  aFocused.selectionStart = 0;
  aFocused.selectionEnd = aFocused.textLength;
});

function isTarget(aElem) {
  return aElem instanceof Ci.nsIDOMHTMLTextAreaElement ||
         (aElem instanceof Ci.nsIDOMHTMLInputElement &&
            aElem.mozIsTextField(false));
}

