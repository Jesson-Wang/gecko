// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["Navigator"];

const { utils:Cu, interfaces: {
    nsIDOMHTMLElement,
    nsIDOMHTMLHtmlElement
  }
} = Components;

Cu.import("resource://gre/modules/Services.jsm");

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Addon",
  "resource://spatialnavigation/Addon.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Direction",
  "resource://spatialnavigation/Direction.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DOMInfo",
  "resource://spatialnavigation/DOMInfo.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "IPC",
  "resource://spatialnavigation/IPC.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "console",
  "resource://spatialnavigation/Console.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Rect",
  "resource://gre/modules/Geometry.jsm");

const focusManager = Services.focus;
const { FLAG_SHOWRING, FLAG_NOSCROLL } = focusManager;

this.Navigator = {
  forwardInputIfRequired(aKey) {
    Addon.trigger("userinput", aKey);

    if (Addon.navigatePrevented) {
      console.debug("Navigation is prevented by addon");
      return true;
    }

    const {focusedElement} = focusManager;
    if (DOMInfo(focusedElement).isRemoteBrowserFrame) {
      Addon.trigger("toremote", focusedElement);
      return true;
    }

    return false;
  },
  moveFocusFromChild(aIframe, aRectFrom, aDirection) {
    console.debug("||moveFocusFromChild:",
                  aIframe,
                  aRectFrom.toString(),
                  aDirection.toString());
    Addon.trigger("premove", aIframe, aDirection);
    if (Addon.navigatePrevented) {
      console.debug("Navigation is prevented by addon");
      return;
    }

    const handledElem = moveFocus(aIframe.ownerDocument.defaultView,
                                  aRectFrom,
                                  aDirection);

    Addon.trigger("postmove", handledElem, aDirection);
  },
  moveFocusFromParent(aTopWindow, aRectFrom, aDirection) {
    console.debug("||moveFocusFromParent");
    Addon.trigger("premove", focusManager.focusedElement, aDirection);
    if (Addon.navigatePrevented) {
      console.debug("Navigation is prevented by addon");
      return;
    }

    const handledElem = moveFocus(aTopWindow, aRectFrom, aDirection, true);

    Addon.trigger("postmove", handledElem, aDirection);
  },
  moveToward(aDirection) {
    console.debug(`||moveToward ${aDirection} from`,
                  focusManager.focusedElement);
    Addon.trigger("premove", focusManager.focusedElement, aDirection);
    if (Addon.navigatePrevented) {
      console.debug("Navigation is prevented by addon");
      return;
    }

    // Retrieve "focusedElement" since it could be changed by "premove" handler
    const {focusedWindow, focusedElement} = focusManager;
    const rectFrom = (function() {
      if (!focusedWindow) {
        aDirection = Direction.down;
        return new Rect(-1, -1, 1, 1);
      }

      let containerIframe;
      if (focusedElement instanceof nsIDOMHTMLHtmlElement) {
        containerIframe = focusedElement.ownerDocument
                                        .defaultView
                                        .realFrameElement;
      } else if (focusedElement){
        const domInfo = DOMInfo(focusedElement);

        if (domInfo.isInViewport()) {
          return domInfo.getBoundingRect();
        }
      } else {
        containerIframe = focusedWindow.realFrameElement;
      }

      if (containerIframe) {
        const rect = DOMInfo(containerIframe).getContentRect();
        rect.x = rect.y = 0;

        const center = rect.center();
        rect.x = center.x;
        rect.y = center.y;

        rect.width = rect.height = 1;
        return rect;
      }

      const { innerWidth,
              document: {
                documentElement: {scrollTop}
              }
            } = focusedWindow;
      const rect = new Rect(0, -1, innerWidth, 1);

      if (scrollTop === 0 &&
          DOMInfo.getRootWindowOfProcess(focusedWindow) === focusedWindow) {
        aDirection = Direction.down;
      }

      // "Search rect", used for finding next focusable elements, is derived
      // from "rect", returned here.
      // For example, If given direction to find next focusable element is down,
      // x and y of "search rect" will be (0, 0) because "rect" has (0, -1) as
      // its x and y and 1 as its height.
      // Similarly, When the direction is up, point (0, -1) have to be
      // contained in "search rect". So, it is translated by (0, rect.height).
      if (aDirection === Direction.up) {
        rect.translate(0, rect.height);
      }

      return rect;
    })();

    const handledElem = moveFocus(focusedWindow, rectFrom, aDirection);

    Addon.trigger("postmove", handledElem, aDirection);

    return handledElem;
  },
  click(aElem) {
    console.debug("||click", aElem);
    if (!(aElem instanceof nsIDOMHTMLElement)) return false;
    if (!DOMInfo(aElem).isInViewport()) {
      console.debug("focused element is not in viewport", aElem);
      return false;
    }

    Addon.trigger("preaction", aElem);
    if (Addon.navigatePrevented) {
      console.debug("Navigation is prevented by Addon");
    } else {
      aElem.click();
      Addon.trigger("postaction", aElem);
    }

    return true;
  }
};

function moveFocus(aWindow,
                   aStartRect,
                   aDirection,
                   aWithinProcessBoundary = false) {
  let topWindow = aWindow;
  for (let iframe of iframesChainFrom(aWindow)) {
    const {documentElement} = iframe.contentDocument;
    if (DOMInfo(documentElement).isScrollable(aDirection)) {
      break;
    }
    const {x, y} = DOMInfo(iframe).getContentRect();
    aStartRect.translate(x, y);
    topWindow = iframe.ownerDocument.defaultView;
  }

  const bestElement = getBestElementOnWindow(topWindow, aStartRect, aDirection);
  console.debug("bestElement:", bestElement,
                "topWindow:", topWindow.document.documentElement);

  const scrollRequiredElement = getScrollRequiredElement();
  if (scrollRequiredElement) {
    console.debug("scrollRequiredElement:", scrollRequiredElement);
    if (doScroll(scrollRequiredElement, aDirection)) {
      return scrollRequiredElement;
    }

    return null;
  } else if (bestElement) {
    if (DOMInfo(bestElement).isRemoteBrowserFrame) {
      const {x, y} = DOMInfo(bestElement).getContentRect(topWindow);

      IPC.searchFocusOnChild(bestElement,
                             aDirection,
                             aStartRect.translate(-x, -y));
    }

    setFocus(bestElement);
  } else if (aWithinProcessBoundary) {
    // we don't find any element to focus on Child side
    // send a message to parent to keep searching on parent side.
    IPC.searchFocusOnParent(aDirection, aStartRect);
  }

  function getScrollRequiredElement() {
    if (!bestElement) {
      for (let elem of parentElementsOf(getCurrentlyFocusedElement())) {
        if (DOMInfo(elem).isScrollable(aDirection)) return elem;
      }
      return null;
    }

    const bestRect = DOMInfo(bestElement).getBoundingRect(topWindow);

    function getCurrentlyFocusedElement() {
        let {focusedWindow, focusedElement} = focusManager;
        if (!focusedElement && focusedWindow) {
          focusedElement = focusedWindow.document.documentElement;
        }
        return focusedElement;
    }

    function *scrollableParents() {
      const focusedElement = getCurrentlyFocusedElement();
      const commonAncestor = findCommonAncestor(focusedElement, bestElement);
      for(let elem of parentElementsOf(focusedElement, commonAncestor)) {
        if (DOMInfo(elem).isScrollable(aDirection)) yield elem;
      }
    }

    for (let elem of scrollableParents()) {
      const scrollableRect = (function() {
        if (elem instanceof nsIDOMHTMLHtmlElement) {
          const iframe = elem.ownerDocument.defaultView.realFrameElement;
          if (iframe) return DOMInfo(iframe).getContentRect(topWindow);
        }
        return DOMInfo(elem).getBoundingRect(topWindow);
      })();

      let scrollRequired;
      switch(aDirection) {
        case Direction.left:
          scrollRequired = bestRect.left < scrollableRect.left;
          break;
        case Direction.right:
          scrollRequired = scrollableRect.right < bestRect.right;
          break;
        case Direction.up:
          scrollRequired = bestRect.top < scrollableRect.top;
          break;
        case Direction.down:
          scrollRequired = scrollableRect.bottom < bestRect.bottom;
          break;
      }
      if (scrollRequired) return elem;
    }

    return null;
  }

  return bestElement;
}

function doScroll(aElem, aDirection) {
  const [left, top] =
    DOMInfo.scrollOffset(aElem.ownerDocument.defaultView, aDirection, true);

  if (left || top) {
    Addon.trigger("prescroll", aElem, left, top);
    if (Addon.navigatePrevented) {
      console.debug("Navigation is prevented by Addon");
    } else {
      const behavior = DOMInfo.scrollBehavior;
      aElem.scrollBy({left, top, behavior});

      Addon.trigger("postscroll", aElem, left, top);
    }
    return true;
  }

  return false;
}

function setFocus(aElem) {
  if (!aElem) {
    console.warn("trying to focus null");
    return false;
  }

  console.info("Set focus to", aElem);

  Addon.trigger("prefocus", aElem);
  if (Addon.navigatePrevented) {
    console.debug("Navigation is prevented by Addon");
    return true;
  }

  focusManager.setFocus(aElem, FLAG_SHOWRING | FLAG_NOSCROLL);

  if (!(aElem instanceof nsIDOMHTMLHtmlElement)) {
    DOMInfo(aElem).scrollIntoViewIfNeeded();
  }

  Addon.trigger("postfocus", aElem);
  return true;
}

/**
 * Find the best element to focus on given window
 * @param {nsIDOMWindow} aWindow
 * @param {Rect} aFocusedRect
 * @param {Direction} aDirection
 * @return null or focusable element
 */
function getBestElementOnWindow(aWindow, aFocusedRect, aDirection) {
  const searchRect = DOMInfo.getSearchRect(aWindow, aFocusedRect, aDirection);
  if (!searchRect) return null;

  const excludedNodes = new WeakSet();

  const {focusedElement} = focusManager;
  if (focusedElement) excludedNodes.add(focusedElement);

  let nodeInfo = DOMInfo.extractFocusableNodesInfo(aWindow,
                                                   searchRect.narrow,
                                                   excludedNodes);
  console.debug("[narrow]focusable nodes", nodeInfo);

  const bestToFocus = getBestToFocus(nodeInfo, aFocusedRect, aDirection);
  if (bestToFocus) return bestToFocus;

  for (let node of nodeInfo.keys()) {
    excludedNodes.add(node);
  }

  nodeInfo = DOMInfo.extractFocusableNodesInfo(aWindow,
                                               searchRect.wide,
                                               excludedNodes);
  console.debug("[wide]focusable nodes", nodeInfo);
  return getBestToFocus(nodeInfo, aFocusedRect, aDirection);
}

/**
 * Returns the best node to focus from given aFocusableNodesInfo
 * @param {Map} aFocusableNodesInfo
 * @param {Rect} aFocusedRect
 * @return null or one of node from aFocusableNodesInfo
 */
function getBestToFocus(aFocusableNodesInfo, aFocusedRect, aDirection) {
  let best, bestDist;

  aFocusableNodesInfo.forEach((nodeRect, node) => {
    // Skip if center of the nodeRect is contained by aFocusedRect
    const {x, y} = nodeRect.center();
    if (aFocusedRect.left <= x && x <= aFocusedRect.right &&
        aFocusedRect.top  <= y && y <= aFocusedRect.bottom) {
      return;
    }

    // Check the distance between the corner of two nodes
    const curDist = edgeDistanceBetween(aFocusedRect, nodeRect, aDirection);
    if (curDist < 0) return;

    if (best) {
      if (bestDist < curDist) return;

      if (curDist === bestDist) {
        var cFocused = cFocused || aFocusedRect.center();
        const cBest = aFocusableNodesInfo.get(best).center();

        const bestDistance = distanceBetween(cFocused, cBest);
        const currentDistance = distanceBetween(cFocused, nodeRect.center());

        if (bestDistance <= currentDistance) return;
      }
    }

    bestDist = curDist;
    best = node;
  });

  return best;
}

function distanceBetween(aPointA, aPointB, aSkipSqrt = true) {
  return diagonalDistance(aPointA.x - aPointB.x,
                          aPointA.y - aPointB.y,
                          aSkipSqrt);
}

function edgeDistanceBetween(aRectFrom, aRectTo, aDirection) {
  const invalid = (function() {;
    switch (aDirection) {
      case Direction.left:
        return aRectFrom.right <= aRectTo.right;
      case Direction.right:
        return aRectTo.left <= aRectFrom.left;
      case Direction.up:
        return aRectFrom.bottom <= aRectTo.bottom;
      case Direction.down:
        return aRectTo.top <= aRectFrom.top;
      default:
        return true;
    }
    return false;
  })();

  if (invalid) return -1;

  function vBorderDistance() {
    return  aRectTo.bottom <= aRectFrom.top ? aRectFrom.top - aRectTo.bottom :
            aRectFrom.bottom <= aRectTo.top ? aRectTo.top - aRectFrom.bottom :
            0;
  }

  function hBorderDistance() {
    return  aRectFrom.right <= aRectTo.left ? aRectTo.left - aRectFrom.right :
            aRectTo.right <= aRectFrom.left ? aRectFrom.left - aRectTo.right :
            0;
  }

  return diagonalDistance(hBorderDistance(), vBorderDistance(), true);
}

function diagonalDistance(aHdist, aVdist, aSkipSqrt = false) {
  const squaredDist = Math.pow(aHdist, 2) + Math.pow(aVdist, 2);

  return aSkipSqrt ? squaredDist : Math.sqrt(squaredDist);
}

function *iframesChainFrom(aWindow) {
  if (!aWindow) return;

  let {realFrameElement} = aWindow;
  while (realFrameElement) {
    yield realFrameElement;

    ({realFrameElement} = realFrameElement.ownerDocument.defaultView);
  }
}

function *parentElementsOf(aElem, aElemUntil = null, aThroughFrame = true) {
  while (aElem && aElem != aElemUntil) {
    yield aElem;

    if (!aElem.parentElement) {
      const {parentNode, ownerDocument:document} = aElem;
      const window = document.defaultView;
      const ShadowRoot = window.ShadowRoot;

      let nextElem;
      if (ShadowRoot && parentNode instanceof ShadowRoot) {
        nextElem = parentNode.host;
      } else if (aThroughFrame && aElem === document.documentElement) {
        nextElem = window.realFrameElement;
      }
      aElem = nextElem;
      continue;
    }

    aElem = aElem.parentElement;
  }
}

function findCommonAncestor(aElem1, aElem2) {
  const parents = new WeakSet(parentElementsOf(aElem2));
  for (let elem of parentElementsOf(aElem1)) {
    if (parents.has(elem)) return elem;
  }
  return null;
}
