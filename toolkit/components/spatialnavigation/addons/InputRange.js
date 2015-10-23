// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

on("preaction", function InputRange_preaction(aKind, aElem) {
  if (!isTarget(aElem)) return;

  ensureRegistered(aElem);

  if (isActive(aElem)) {
    deactivate(aElem);
  } else {
    activate(aElem);
  }

  stopNavigation();
});

on("premove", (aKind, aElem) => {isActive(aElem) && stopNavigation()});

var registeredElems = new WeakSet();
const kPseudoClass = ":active";
const inIDOMUtils   = Cc["@mozilla.org/inspector/dom-utils;1"]
                        .getService(Ci.inIDOMUtils);

function isTarget(aElem) {
  return aElem instanceof Ci.nsIDOMHTMLInputElement && aElem.type === "range";
}

function ensureRegistered(aElem) {
  if (registeredElems.has(aElem)) return;

  registeredElems.add(aElem);

  aElem.addEventListener('blur', function() {
      deactivate(aElem);
    }, true);
}

function isActive(aElem) {
  if (!registeredElems.has(aElem)) return false;
  return inIDOMUtils.hasPseudoClassLock(aElem, kPseudoClass);
}

function activate(aElem) {
  inIDOMUtils.addPseudoClassLock(aElem, kPseudoClass);
}

function deactivate(aElem) {
  inIDOMUtils.removePseudoClassLock(aElem, kPseudoClass);
}

