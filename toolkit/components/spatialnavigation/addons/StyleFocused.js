// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://spatialnavigation/PrefObserver.jsm");
Cu.import("resource://spatialnavigation/StyleSheetsManager.jsm");

const {USER_SHEET} = Ci.nsIStyleSheetService;
const kURI   = "resource://gre-resources/spatialnavigation.css";

const kPrefUser   = 'style.user';
const kPrefAuthor = 'style.author';

processUserStyle();
processAuthorStyle();

PrefObserver.on(kPrefAuthor, processAuthorStyle);
PrefObserver.on(kPrefUser,   processUserStyle);

function processUserStyle(aKind, aEnable = PrefObserver[kPrefUser]) {
  aEnable ? StyleSheetsManager.registerStyleSheet(kURI, USER_SHEET):
            StyleSheetsManager.unregisterStyleSheet(kURI, USER_SHEET);
}

function processAuthorStyle(aKind, aEnable = PrefObserver[kPrefAuthor]) {
  aEnable ? StyleSheetsManager.registerStyleSheet(kURI):
            StyleSheetsManager.unregisterStyleSheet(kURI);
}

