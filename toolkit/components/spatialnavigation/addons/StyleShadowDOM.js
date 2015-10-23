// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://spatialnavigation/PrefObserver.jsm");

on("prefocus", (aKind, aFocused) => handleShadowDOM(aFocused));

function handleShadowDOM(elem) {
  if (!PrefObserver['enabled'] ||
      !elem instanceof Ci.nsIDOMNode ||
      elem.ownerDocument.contains(elem)) return;

  const ShadowRoot = elem.ownerDocument.defaultView.ShadowRoot;
  if (!ShadowRoot) return;

  while (!(elem instanceof ShadowRoot)) elem = elem.parentNode;
  // FIXME : Contents of Shadow DOM doesn't affect by CSS from outside the
  // ShadowRoot by default.
  // * Use "/deep/" CSS combinator if possible.(Gecko doesn't support yet)
  // * "applyAuthorStyles" is set to true to force
  //   StyleSheetsManager.UNIFORMED_STYLE to elements within Shadow DOM.
  //   It MUST be recovered after the element losing focus.
  if (elem instanceof ShadowRoot) elem.applyAuthorStyles = true;
}
