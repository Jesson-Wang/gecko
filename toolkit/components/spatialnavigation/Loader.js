// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { interfaces:Ci, utils:Cu } = Components;

if (this instanceof Ci.nsIContentFrameMessageManager) {
  Cu.import("resource://gre/modules/SpatialNavigationB2G.jsm", {});

  const {Services: {appinfo: {processType}}} =
    Cu.import("resource://gre/modules/Services.jsm", {});

  if (processType !== Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT) {
    Cu.import("resource://spatialnavigation/IPC.jsm", {})
      .IPC.registerListenerOnChild(this);
  }

  Cu.import("resource://spatialnavigation/EventBroker.jsm", {});

  Cu.import("resource://spatialnavigation/InputManager.jsm", {})
    .InputManager.init(this);

  Cu.import("resource://spatialnavigation/Addon.jsm", {})
    .Addon.init(this);
}
