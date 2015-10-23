// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["IPC"];

const { interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Rect",
  "resource://gre/modules/Geometry.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Direction",
  "resource://spatialnavigation/Direction.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DOMInfo",
  "resource://spatialnavigation/DOMInfo.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "console",
  "resource://spatialnavigation/Console.jsm");

const { EventEmitter } =
  Cu.import("resource://gre/modules/devtools/event-emitter.js", {});

const SearchMessage = { "sendToParent" : "Webapps:Snavi:searchOnParentSide",
                        "sendToChild"  : "Webapps:Snavi:searchOnChildSide" };

this.IPC = new EventEmitter();

var cfmmInitialized = false;

// This will be replaced in IPC.registerListenerOnChild() if necessary.
function sendMessageToParent() {}

IPC.searchFocusOnParent =
function IPC_searchFocusOnParent(aDirection, aStartRect) {
  console.debug(`||IPC_searchFocusOnParent ${aDirection}, ${aStartRect}`);
  sendMessageToParent(SearchMessage.sendToParent, aDirection, aStartRect);
}

IPC.registerListenerOnParent = function IPC_registerListenerOnParent(aCFMM) {
  aCFMM.addMessageListener(SearchMessage.sendToParent, aMsg => {
    const { target, data: {direction, rect} } = aMsg;

    const {x, y} = DOMInfo(target).getContentRect();

    const focusedRect = new Rect().copyFrom(rect)
                                  .translate(x, y);

    this.emit("movefocus:fromchild", target, focusedRect, Direction[direction]);
  });
}

IPC.searchFocusOnChild =
function IPC_searchFocusOnChild(aIFrame, aDirection, aStartRect) {
  console.debug(aDirection, aStartRect);
  aIFrame.QueryInterface(Ci.nsIFrameLoaderOwner)
         .frameLoader
         .messageManager
         .sendAsyncMessage(SearchMessage.sendToChild,
                           {direction: aDirection, rect: aStartRect});
}

IPC.registerListenerOnChild = function IPC_registerListenerOnChild(aCFMM) {
  aCFMM.addMessageListener(SearchMessage.sendToChild, aMsg => {
    const { target: {content}, data: {direction, rect} } = aMsg;

    const focusedRect = new Rect().copyFrom(rect);

    this.emit("movefocus:fromparent",
              content,
              focusedRect,
              Direction[direction]);
  });

  if (!cfmmInitialized) {
    sendMessageToParent = function sendMessageToParent(aMessage,
                                                       aDirection,
                                                       aStartRect) {
      console.info("sendMessageToParent:", aMessage, aDirection, aStartRect);
      aCFMM.sendAsyncMessage(aMessage,
                             {direction:aDirection, rect:aStartRect});
    }
    cfmmInitialized = true;
  }
}
