// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * To use SpatialNavigationB2G, just import this as below.
 *
 * Components.utils.import("resource://gre/modules/SpatialNavigationB2G.jsm");
 *
 */

this.EXPORTED_SYMBOLS = [];

const { interfaces:Ci, utils:Cu } = Components;

const {Services: {io, appinfo: {processType}, obs}} =
  Cu.import("resource://gre/modules/Services.jsm", {});

const kModuleName = "spatialnavigation";
const kSpatialNavigationRootURI = "resource://gre/modules/spatialnavigation/";
const kLoaderURI = `${kSpatialNavigationRootURI}Loader.js`;

const nsIResProtocolHandler = io.getProtocolHandler("resource")
                                .QueryInterface(Ci.nsIResProtocolHandler);

if (!nsIResProtocolHandler.hasSubstitution(kModuleName)) {
  const rootURI = io.newURI(kSpatialNavigationRootURI, null, null);
  nsIResProtocolHandler.setSubstitution(kModuleName, rootURI);
}

////////////////////////////////////////////////////////////////////////////////
// Loader - Load SpatialNavigationB2G as framescript

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DOMApplicationRegistry",
  "resource://gre/modules/Webapps.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  `resource://${kModuleName}/PrefObserver.jsm`);
XPCOMUtils.defineLazyModuleGetter(this, "IPC",
  `resource://${kModuleName}/IPC.jsm`);
XPCOMUtils.defineLazyModuleGetter(this, "console",
  `resource://${kModuleName}/Console.jsm`);

if (processType === Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT) {
  const chromeWindow = Cu.import("resource://spatialnavigation/DOMInfo.jsm")
                         .DOMInfo
                         .getRootWindowOfProcess(null, true);
  if (chromeWindow) {
    console.log("Injecting SpatialNavigationB2G into all children frames");
    loadFrameScript(chromeWindow.messageManager
                                .QueryInterface(Ci.nsIFrameScriptLoader));
  }
}

obs.addObserver(injectFrameScript, "remote-browser-shown", false);

function injectFrameScript(aSubject) {
  const frameLoader = aSubject.QueryInterface(Ci.nsIFrameLoader);

  // Ignore notifications that aren't from a BrowserOrApp
  if (!frameLoader.ownerIsBrowserOrAppFrame) return;

  if (PrefObserver["filter.enable"] &&
      !isPermittedMozBrowserFrame(frameLoader.ownerElement)) {
    return;
  }

  console.log("Injecting SpatialNavigationB2G into remote browser");
  loadFrameScript(frameLoader.messageManager);
}

function loadFrameScript(aMM) {
  try {
    aMM.loadFrameScript(kLoaderURI, true, false);
    IPC.registerListenerOnParent(aMM);
  } catch (e) {
    console.error(`Failed to load ${kLoaderURI} as frame script: ${e}\n`);
    Cu.reportError(e);
  }
}

function isPermittedMozBrowserFrame(aMozBrowserFrame) {
  if (!(aMozBrowserFrame instanceof Ci.nsIMozBrowserFrame)) return false;

  const {appManifestURL} = aMozBrowserFrame;

  if (!appManifestURL || // aMozBrowserFrame contains web content
      appManifestURL === PrefObserver["filter.enable.browser.manifest"]) {
    return PrefObserver["filter.enable.browser"];
  }

  // aMozBrowserFrame is an app.
  const app = DOMApplicationRegistry.getAppByManifestURL(appManifestURL);

  function whiteList(aKey) {
    const prefKey = `filter.whitelist.${aKey}`;
    try {
      return new Set(JSON.parse(PrefObserver[prefKey]));
    } catch(e) {
      console.error(`Failed to parse JSON from preference "${prefKey}"`);
      Cu.reportError(e);
    }
  }

  if (whiteList("installOrigin").has(app.installOrigin) ||
      whiteList("manifest").has(appManifestURL)) {
    return true;
  }

  return false;
}
