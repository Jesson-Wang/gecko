// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DOMInfo",
  "resource://spatialnavigation/DOMInfo.jsm");

const InputTypeOk2Return = new Set(["search", "password", "text"]);

on("preaction",
  function OkKeyPreAction(aKind, aFocused) {
    if (isControllableAudioVideoElem(aFocused)) return;

    if (aFocused instanceof Ci.nsIDOMHTMLInputElement) {
      if (InputTypeOk2Return.has(aFocused.type)) {
        if (fireReturnKeyEvent(aFocused)) {
          stopNavigation();
        }
      }

      // Input element has click handler. Let Navigator handle it.
      // If touch/mouse event is sent to "range" type input element, its value
      // will be changed into a value at center of it.
      return;
    }

    // TODO : make cx, cy in viewport
    const {cx, cy} = DOMInfo(aFocused).getBoundingRect();
    const windowUtils = aFocused.ownerDocument
                                .defaultView
                                .QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);

    if (aFocused === windowUtils.elementFromPoint(cx, cy, true, true)) {
      if(PrefObserver['allow.touchevent']) {
        fireTouchEvent(windowUtils, cx, cy);
      }
      fireMouseEvent(windowUtils, cx, cy);

      stopNavigation();
    }

    return;
  });

function isControllableAudioVideoElem(aElem) {
  // <audio>, <video> element with 'controls' attribute
  const {HTMLVideoElement, HTMLAudioElement} = aElem.ownerDocument.defaultView;
  return (aElem instanceof HTMLVideoElement ||
          aElem instanceof HTMLAudioElement) &&
         aElem.controls;
}

function fireReturnKeyEvent(aElem) {
  const windowUtils = aElem.ownerDocument
                           .defaultView
                           .QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindowUtils);

  const key = Ci.nsIDOMKeyEvent.DOM_VK_RETURN;

  return windowUtils.sendKeyEvent("keypress",
                                  Ci.nsIDOMKeyEvent.DOM_VK_RETURN,
                                  0,
                                  0);
}

function fireTouchEvent(aWindowUtils, aX, aY) {
  const id = Number.MAX_SAFE_INTEGER; // XXX
  for (let evtType of ['touchstart', 'touchend']) {
    aWindowUtils.sendTouchEvent(evtType, [id], [aX], [aY],
                               [1], [1], [0], [1], 1, 0 );
  }
}

function fireMouseEvent(aWindowUtils, aX, aY) {
  for (let evtType of ['mousedown', 'mouseup']) {
    aWindowUtils.sendMouseEvent(evtType, aX, aY, 0, 1 , 0);
  }
}

