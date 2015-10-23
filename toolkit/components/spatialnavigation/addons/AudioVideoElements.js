// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes:Cc, interfaces:Ci, utils:Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "StyleSheetsManager",
  "resource://spatialnavigation/StyleSheetsManager.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PrefObserver",
  "resource://spatialnavigation/PrefObserver.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Direction",
  "resource://spatialnavigation/Direction.jsm");

const {AGENT_SHEET} = Ci.nsIStyleSheetService;
const kURI = "resource://gre-resources/spatialnavigation.css";

// FIXME : Duplicated sheets loaded.
PrefObserver.on("enabled", (aKind, aEnable) => {
  aEnable ? StyleSheetsManager.registerStyleSheet(kURI, AGENT_SHEET):
            StyleSheetsManager.unregisterStyleSheet(kURI, AGENT_SHEET);
});

on("preaction", function AVPreAction(aKind, aAudioVideoElem) {
  if (!isTargetElement(aAudioVideoElem)) return;

  const controller = xulController.get(aAudioVideoElem);
  if (!controller) return;

  if (!controller.isShown)  {
    controller.show();
    stopNavigation();
    return;
  }

  const { focusedNode } = controller;
  if (focusedNode) {
    focusedNode.click();

    stopPropagation();
    preventDefault();
    stopNavigation();
  }
});

on("postfocus", function AVPostFocus(aKind, aJustFocusedElem) {
  if (isTargetElement(aJustFocusedElem)) {
    const controller = xulController.get(aJustFocusedElem);
    if (controller && controller.isShown && !controller.focusedNode) {
      controller.show();
      stopNavigation();
    }
  }
});

on("premove", function AVPreMove(aKind, aFocusedElem, aDir) {
  if (!isTargetElement(aFocusedElem)) return;

  const controller = xulController.get(aFocusedElem);
  if (controller && controller.move(aDir)) {
    stopPropagation();
    preventDefault();
    stopNavigation();
  }
});

////////////////////////////////////////////////////////////////////////////////

XPCOMUtils.defineLazyServiceGetter(this, "inIDOMUtils",
                                   "@mozilla.org/inspector/dom-utils;1",
                                   "inIDOMUtils");
XPCOMUtils.defineLazyGetter(this, "assert", () =>
  new (Cu.import("resource://specialpowers/Assert.jsm", {}).Assert));

function isTargetElement(aElem) {
  if (aElem instanceof Ci.nsIDOMNode) {
    // <audio>, <video> element with 'controls' attribute
    const {HTMLVideoElement, HTMLAudioElement} = aElem.ownerDocument
                                                      .defaultView;
    if (aElem instanceof HTMLVideoElement ||
        aElem instanceof HTMLAudioElement) {
      return aElem.controls && prepareXULController(aElem);
    }
  }
  return false;
}

const xulController = new WeakMap();
function prepareXULController(aAudioVideoElem) {
  if (xulController.has(aAudioVideoElem)) {
    return xulController.get(aAudioVideoElem);
  }

  const {KeyboardEvent} = aAudioVideoElem.ownerDocument.defaultView;
  const {DOM_VK_LEFT, DOM_VK_RIGHT} = KeyboardEvent;

  const layoutMap = new WeakMap();
  let TouchUtils, defaultFocusNode, _focusedNode;

  retrieveFocusableNodes(getVideocontrolsElem());

  aAudioVideoElem.addEventListener("blur",
      e => e.target === aAudioVideoElem && blurFocus());

  aAudioVideoElem.addEventListener("VideoBindingAttached",
      e => retrieveFocusableNodes(e.originalTarget), true, true);

  function getVideocontrolsElem() {
    const htmlChildren =
      new WeakSet(inIDOMUtils.getChildrenForNode(aAudioVideoElem, false));

    const videocontrols =
      Array.from(inIDOMUtils.getChildrenForNode(aAudioVideoElem, true))
           .filter(e => !htmlChildren.has(e))
           .find(e => e.tagName === "videocontrols");

    assert.ok(videocontrols);
    return videocontrols;
  }

  function retrieveFocusableNodes(aVideocontrolsElem) {
    ({TouchUtils} = aVideocontrolsElem.wrappedJSObject);

    const {
      castingButton,
      Utils: {
        fullscreenButton,
        playButton,
        muteButton,
        bufferBar: { previousElementSibling: progressBar }
      }
    } = TouchUtils;

    assert.equal(progressBar.className, "backgroundBar",
                 "Found backgroundBar as container of progressBar");

    // Focusable nodes layout)
    // +---------------+------------------+------------+------------+
    // | castingButton | fullscreenButton | playButton | muteButton |
    // +---------------+------------------+------------+------------+
    // |                       progressBar                          |
    // +------------------------------------------------------------+

    function dispatchKeyPress(aKeyCode) {
      aAudioVideoElem.dispatchEvent(
          new KeyboardEvent("keypress", {ctrlKey: true, keyCode: aKeyCode}));
    }

    defaultFocusNode = playButton;
    _focusedNode = null;

    layoutMap.set(castingButton,    { [Direction.right]: fullscreenButton,
                                      [Direction.down]:  progressBar})
             .set(fullscreenButton, { [Direction.left]:  castingButton,
                                      [Direction.right]: playButton,
                                      [Direction.down]:  progressBar})
             .set(playButton,       { [Direction.left]:  fullscreenButton,
                                      [Direction.right]: muteButton,
                                      [Direction.down]:  progressBar})
             .set(muteButton,       { [Direction.left]:  playButton,
                                      [Direction.down]:  progressBar})
             .set(progressBar,      { [Direction.up]:    playButton,
                                      [Direction.left]:  () =>
                                          dispatchKeyPress(DOM_VK_LEFT),
                                      [Direction.right]: () =>
                                          dispatchKeyPress(DOM_VK_RIGHT) });
  }

  function blurFocus() {
    if (_focusedNode) {
      inIDOMUtils.removePseudoClassLock(_focusedNode, ":-moz-focusring");
      _focusedNode = null;
    }
  }

  function setFocus(aNode) {
    if (!layoutMap.get(aNode)) return false;

    blurFocus();

    _focusedNode = aNode;
    inIDOMUtils.addPseudoClassLock(aNode, ":-moz-focusring");

    TouchUtils.showControls();

    return true;
  }

  function isVisible(aNode) {
    return !aNode.hidden && aNode.clientWidth && aNode.clientHeight;
  }

  function handleMove(aDirection) {
    let candidate = _focusedNode;

    do {
      try {
        candidate = layoutMap.get(candidate)[aDirection];

        if (typeof(candidate) === "function") {
          candidate();
          break;
        } else if (isVisible(candidate)) {
          setFocus(candidate);
          break;
        }
      } catch (e) {
        candidate = null;
      }
    } while (candidate);

    TouchUtils.delayHideControls(TouchUtils.controlsTimeout);

    return !!candidate;
  }

  return xulController.set(aAudioVideoElem, {
    get isShown()     { return TouchUtils.visible; },
    get focusedNode() { return _focusedNode; },
    show() {
      if (_focusedNode) {
        TouchUtils.showControls();
      } else {
        setFocus(defaultFocusNode);
      }
    },
    move(aDirection) {
      if (!this.isShown) {
        return false;
      }

      if (!_focusedNode) {
        setFocus(defaultFocusNode);
        return true;
      }

      switch(aDirection) {
        case Direction.left:
        case Direction.right:
        case Direction.up:
        case Direction.down:
          return handleMove(aDirection);
      }

      return false;
    }
  });
}
