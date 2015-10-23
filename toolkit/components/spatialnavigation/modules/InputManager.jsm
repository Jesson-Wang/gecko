// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["InputManager"];

const { interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "focusManager",
  "@mozilla.org/focus-manager;1", "nsIFocusManager");
XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Direction",
  "resource://spatialnavigation/Direction.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "clearTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DOMInfo",
  "resource://spatialnavigation/DOMInfo.jsm");


XPCOMUtils.defineLazyModuleGetter(this, "console",
  "resource://spatialnavigation/Console.jsm");

const { EventEmitter } =
  Cu.import("resource://gre/modules/devtools/event-emitter.js", {});

this.InputManager = new EventEmitter();

InputManager.init = function InputManager_init(aCFMM) {
  aCFMM.addEventListener("keydown", this, true);
  aCFMM.addEventListener("keyup", this, true);
  aCFMM.addEventListener("blur", LongKeyManager.clearAll, true);
  aCFMM.addEventListener("focus", LongKeyManager.clearAll, true);
}

var eventInProcessing = Cu.getWeakReference(null);

InputManager.handleEvent = function InputManager_handleEvent(aEvent) {
  //If Spatial Navigation isn't enabled, return.
  if (!PrefObserver['enabled']) return;

  // If it is not using the modifiers it should, return.
  if (!aEvent.altKey && PrefObserver['modifierAlt'] ||
      !aEvent.shiftKey && PrefObserver['modifierShift'] ||
      !aEvent.crtlKey && PrefObserver['modifierCtrl']) {
    return;
  }

  // Use whatever key value is available (either keyCode or charCode).
  // It might be useful for addons or whoever wants to set different
  // key to be used here (e.g. "a", "F1", "arrowUp", ...).
  const key = aEvent.which || aEvent.keyCode;

  eventInProcessing = Cu.getWeakReference(aEvent);
  switch(aEvent.type) {
    case "keydown":
      this.onKeyDown(key);
      break;
    case "keyup":
      this.onKeyUp(key);
      break;
  }
  eventInProcessing = Cu.getWeakReference(null);
}

InputManager.preventDefault = function InputManager_preventDefault() {
  const event = eventInProcessing.get();
  event && event.preventDefault();
}

InputManager.stopPropagation = function InputManager_stopPropagation() {
  const event = eventInProcessing.get();
  event && event.stopPropagation();
}

InputManager.stopImmediatePropagation =
function InputManager_stopImmediatePropagation() {
  const event = eventInProcessing.get();
  event && event.stopImmediatePropagation();
}

InputManager.onKeyDown = function InputManager_onKeyDown(aKey) {
  if (isActionKey(aKey)) {
    this.emit("userinput", aKey);
    this.emit("userinput:ok", focusManager.focusedElement);
  } else {
    const direction = Direction.fromKey(aKey);
    if (direction) {
      this.emit("userinput", aKey);
      this.emit("userinput:direction", direction);
    } else {
      return;
    }
  }
  LongKeyManager.track(aKey);
}

InputManager.onKeyUp = function InputManager_onKeyUp(aKey) {
  LongKeyManager.clear(aKey);
}

function isActionKey(aKey) {
  return aKey === PrefObserver['keyCodeOK'] ||
         aKey === PrefObserver['keyCodeReturn'];
}
////////////////////////////////////////////////////////////////////////////////
const LongKeyManager = (function() {
  const longKeyTimers = new Map();

  const kInitialInterval = 300;
  let longKeyInterval = kInitialInterval;

  function track(aKey) {
    clear(aKey, false);

    longKeyTimers.set(aKey, setTimeout(doLongKey, longKeyInterval, aKey));

    function doLongKey(aKey) {
      console.debug(`>> doLongKey(${aKey})`);
      if (isActionKey(aKey)) {
        InputManager.emit("userinput:long:ok", focusManager.focusedElement);
      } else {
        const direction = Direction.fromKey(aKey);
        if (direction) {
          InputManager.emit("userinput:long:direction", direction);
        } else {
          return;
        }
      }

      if (!DOMInfo(focusManager.focusedElement).isRemoteBrowserFrame) {
        longKeyInterval = 0;
        longKeyTimers.set(aKey, setTimeout(doLongKey, longKeyInterval, aKey));
      }
    }
  }

  function clear(aKey, aResetInterval = true) {
    if (longKeyTimers.has(aKey)) {
      clearTimeout(longKeyTimers.get(aKey));
      longKeyTimers.delete(aKey);
      if (aResetInterval) {
        longKeyInterval = kInitialInterval;
      }
    }
  }

  function clearAll(aEvent) {
    if (!(aEvent.target instanceof Ci.nsIDOMWindow)) return;

    for (let id of longKeyTimers.values()) {
      clearTimeout(id);
    }

    longKeyTimers.clear();
    longKeyInterval = kInitialInterval;
  }

  return {track, clear, clearAll};
})();
