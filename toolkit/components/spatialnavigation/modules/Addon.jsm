// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/******************************************************************************
 * AddOn Handler chain
 *
 * <key event>
 *   |
 *   v Triggered for every valid key input
 * userinput -----------------------------------------------------------------+
 *   |                                                                        |
 *   |   Currently focused element is remote mozbrowser                       |
 *   +-> toremote ------------------------------------------------------------+
 *   |                                                                        |
 *   |   Triggered for OK key input                                           |
 *   +-> preaction -----------------------------------------------------------+
 *   |       |                                                                |
 *   |       +----> [click()] --> postaction ---------------------------------+
 *   |                                                                        |
 *   |   Triggered for every arrow key input                                  |
 *   +-> premove -------------------------------------------------------------+
 *          |                                                                 |
 *          +------+--------------------------------------------+-> postmove -+
 *                 |                                            |             |
 *                 +-> prefocus --------------------------------+             |
 *                 |      |                                     |             |
 *                 |      +--------> [focus()] ---> postfocus --+             |
 *                 |                                            |             |
 *                 +-> prescroll -------------------------------+             |
 *                        |                                     |             |
 *                        +--------> [scroll()] --> postscroll -+             |
 *                                                                            |
 *                                                                  <Done> <--+
 ******************************************************************************/
/******************************************************************************
 * Parameters for each handlers
 *-----------------------------------------------------------------------------
 * userinput  : function (aKey)
 * toremote   : function (aMozBrowserFrame)
 * preaction  : function (aTargetElem)
 * postaction : function (aTargetElem)
 * premove    : function (aFocusedElem, aDirection)
 * postmove   : function (aElemJustMoved, aDirection, aElemPreFocused)
 * prefocus   : function (aElemToFocus)
 * postfocus  : function (aElemJustFocused)
 * prescroll  : function (aElemToBeScrolled, dx, dy)
 * postscroll : function (aElemJustScrolled, dx, dy)
 ******************************************************************************/

this.EXPORTED_SYMBOLS = ["Addon"];

const { interfaces:Ci, utils:Cu, Constructor:CC } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import('resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Console",
  "resource://spatialnavigation/Console.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "console",
  "resource://spatialnavigation/Console.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "InputManager",
  "resource://spatialnavigation/InputManager.jsm");
XPCOMUtils.defineLazyGetter(this, "systemPrincipal",
  Services.scriptSecurityManager.getSystemPrincipal);
XPCOMUtils.defineLazyGetter(this, "loadSubScript", () =>
  Services.scriptloader.loadSubScript.bind(Services.scriptloader));

const File = CC("@mozilla.org/file/local;1", Ci.nsILocalFile, "initWithPath");

const { EventEmitter } =
    Cu.import("resource://gre/modules/devtools/event-emitter.js", {});

this.Addon = new EventEmitter();

Addon.init = function Addon_init(aCFMM) {
  console.log("Initialize addons");
  this.emit("init", aCFMM);
}

Object.defineProperty(Addon, "navigatePrevented", {
  get() { return this.preventNavigation; }
});

Addon.trigger = function Addon_trigger(aKey, ...a) {
  this.preventNavigation = false;
  this.emit(aKey, ...a);
  return this.preventNavigation;
}

Addon.stopNavigation = function Addon_stopNavigation() {
  this.preventNavigation= true;
}

const sandboxGlobal = {
  stopNavigation: Addon.stopNavigation.bind(Addon),

  on:   Addon.on.bind(Addon),
  off:  Addon.off.bind(Addon),
  once: Addon.once.bind(Addon),

  preventDefault:           InputManager.preventDefault
                                        .bind(InputManager),
  stopPropagation:          InputManager.stopPropagation
                                        .bind(InputManager),
  stopImmediatePropagation: InputManager.stopImmediatePropagation
                                        .bind(InputManager),
}

const addonBaseURI = PrefObserver["addon.baseURI"];

for (let addon of filesInResourcesScheme(addonBaseURI, "*.js$")) {
  importAddon(`${addonBaseURI}/${addon}`, sandboxGlobal);
}

function importAddon(aUrl, aSandboxPrototype) {
  console.log("Loading addon from", aUrl);
  try {
    const sandboxOptions = { sandboxName: aUrl };
    if (aSandboxPrototype) sandboxOptions.sandboxPrototype = aSandboxPrototype;

    const sandbox = Cu.Sandbox(systemPrincipal, sandboxOptions);

    const consolePrefix = '[' + aUrl.substring(aUrl.lastIndexOf('/')+1) + ']';
    sandbox.console = new Console(consolePrefix);

    loadSubScript(aUrl, sandbox);
  } catch(e) {
    Cu.reportError(e);
  }
}

function* filesInResourcesScheme(aURIString,
                                 aPattern = '*',
                                 aExcludeSubDir = true,
                                 aCachedOnly = false) {
  if (!aURIString.endsWith('/')) aURIString += '/';

  const resourceURI = Services.io.newURI(aURIString, null, null);

  if (resourceURI.scheme !== "resource") return;

  let protHandler = protocolHandlerForScheme(resourceURI.scheme);
  if (!(protHandler instanceof Ci.nsIResProtocolHandler)) return;

  const jarURI = protHandler.getSubstitution(resourceURI.asciiHost);
  protHandler = protocolHandlerForScheme(jarURI.scheme);
  if (!(protHandler instanceof Ci.nsIJARProtocolHandler)) return;


  const [strFilePathOmniJa, pathInOmniJa] = (function() {
    const jarPath = jarURI.path.slice(7); // remove "file://"

    const exMark = "!/";
    const idxExMark = jarPath.indexOf(exMark);

    return [jarPath.slice(0, idxExMark),
            jarPath.slice(idxExMark + exMark.length) +
              resourceURI.path.slice(1)]; // remove heading '/'

  })();
  const nsIFileOmniJa = new File(strFilePathOmniJa);

  const {JARCache} = protHandler;
  if (aCachedOnly && !JARCache.isCached(nsIFileOmniJa)) return;

  const zipReader = JARCache.getZip(nsIFileOmniJa);

  if (zipReader.hasEntry(pathInOmniJa)) {
    const iterator =  zipReader.findEntries(pathInOmniJa + aPattern);
    while (iterator.hasMore()) {
      const entry = iterator.getNext().slice(pathInOmniJa.length);
      if (!entry.length) continue;
      if (aExcludeSubDir && entry.indexOf('/') !== -1) continue;
      yield entry;
    }
  }

  function protocolHandlerForScheme(aScheme) {
    let _interface;
    switch(aScheme) {
      case "resource":
        _interface = Ci.nsIResProtocolHandler;
        break;
      case "jar":
        _interface = Ci.nsIJARProtocolHandler;
        break;
      default:
        return null;
    }

    return Services.io.getProtocolHandler(aScheme).QueryInterface(_interface);
  }
}
