// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Snav preference observer
this.EXPORTED_SYMBOLS = ["PrefObserver"];

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

// modifier values
const kAlt   = "alt";
const kShift = "shift";
const kCtrl  = "ctrl";
const kNone  = "none";

const prefBranch =
  Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService)
                                          .getBranch("snav.");

const {PREF_INVALID, PREF_STRING, PREF_INT, PREF_BOOL} = prefBranch;
const {DOM_VK_LEFT,   DOM_VK_RIGHT,
       DOM_VK_UP,     DOM_VK_DOWN,
       DOM_VK_RETURN, DOM_VK_SELECT} = Ci.nsIDOMKeyEvent;

var defaultPrefs = new Map([
  ["enabled",           false],
  ["xulContentEnabled", false],
  ["keyCode.modifier",  ""],
  ["keyCode.left",      DOM_VK_LEFT],
  ["keyCode.right",     DOM_VK_RIGHT],
  ["keyCode.up",        DOM_VK_UP],
  ["keyCode.down",      DOM_VK_DOWN],
  ["keyCode.return",    DOM_VK_RETURN],
  ["keyCode.ok",        DOM_VK_SELECT]
]);

// Aliases are used for legacy
var aliasPref2Prop = new Map([
  ["keyCode.left",   "keyCodeLeft"],
  ["keyCode.right",  "keyCodeRight"],
  ["keyCode.up",     "keyCodeUp"],
  ["keyCode.down",   "keyCodeDown"],
  ["keyCode.return", "keyCodeReturn"],
  ["keyCode.ok",     "keyCodeOK"],
]);

// Aliases are used for legacy
var aliasProp2Pref = new Map([
  ["keyCodeLeft",   "keyCode.left"],
  ["keyCodeRight",  "keyCode.right"],
  ["keyCodeUp",     "keyCode.up"],
  ["keyCodeDown",   "keyCode.down"],
  ["keyCodeReturn", "keyCode.return"],
  ["keyCodeOK",     "keyCode.ok"],
  ["modifierAlt",   "keyCode.modifier"],
  ["modifierShift", "keyCode.modifier"],
  ["modifierCtrl",  "keyCode.modifier"],
]);

var prefCache = {};

Cu.import("resource://gre/modules/devtools/event-emitter.js", {})
  .EventEmitter
  .decorate(prefCache);

this.PrefObserver = new Proxy(prefCache, {
  get(prefCache, aKey) {
    if (aKey in prefCache) return prefCache[aKey];

    // fetch preference to the cache
    Observer.observe(null, "nsPref:changed", aliasProp2Pref.get(aKey) || aKey);

    return prefCache[aKey];
  },
  set() {
    // If this is possible, the name PrefObserver should be changed.
    return false;
  }
});

var Observer = {
  observe(aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed") {
      return;
    }

    // aSubject is the nsIPrefBranch we're observing (after appropriate QI)
    // aData is the name of the pref that's been changed (relative to aSubject)
    switch (aData) {
      case "keyCode.modifier": {
        let keyCodeModifier;
        try {
          keyCodeModifier = prefBranch.getCharPref("keyCode.modifier");

          // resetting modifiers
          prefCache.modifierAlt = false;
          prefCache.modifierShift = false;
          prefCache.modifierCtrl = false;

          if (keyCodeModifier != kNone) {
            // we are using '+' as a separator in about:config.
            const mods = keyCodeModifier.split(/\++/);
            for (let i = 0; i < mods.length; i++) {
              const mod = mods[i].toLowerCase();
              if (mod === "") {
                continue;
              } else if (mod == kAlt) {
                prefCache.modifierAlt = true;
              } else if (mod == kShift) {
                prefCache.modifierShift = true;
              } else if (mod == kCtrl) {
                prefCache.modifierCtrl = true;
              } else {
                keyCodeModifier = kNone;
                break;
              }
            }
          }
        } catch(e) { }
        break;
      }

      default: {
        let pref = getPref(aData);
        if (pref === null && defaultPrefs.has(aData)) {
          pref = defaultPrefs.get(aData);
        }
        prefCache[aData] = pref;

        if (aliasPref2Prop.has(aData)) {
          prefCache[aliasPref2Prop.get(aData)] = pref;
        }
        break;
      }
    }

    prefCache.emit(aData, prefCache[aData]);
  }
};

prefBranch.addObserver("", Observer, false);

function getPref(aKey) {
  switch(prefBranch.getPrefType(aKey)) {
    case PREF_STRING:
      return prefBranch.getCharPref(aKey);
    case PREF_INT:
      return prefBranch.getIntPref(aKey);
    case PREF_BOOL:
      return prefBranch.getBoolPref(aKey);
    case PREF_INVALID:
    default:
      break;
  }
  return null;
}
