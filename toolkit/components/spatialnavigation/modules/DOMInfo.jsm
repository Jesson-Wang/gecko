// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["DOMInfo"];

const { classes:Cc, utils:Cu, interfaces: {
    nsIDOMChromeWindow,
    nsIDOMClientRect,
    nsIDOMElement,
    nsIDOMHTMLCanvasElement,
    nsIDOMHTMLElement,
    nsIDOMHTMLBodyElement,
    nsIDOMHTMLIFrameElement,
    nsIDOMWindow,
    nsIDOMWindowUtils,
    nsIDocShell,
    nsIDocShellTreeItem,
    nsIInterfaceRequestor,
    nsIScreenManager,
    nsIWebNavigation,
  }
} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  'resource://gre/modules/Services.jsm');

XPCOMUtils.defineLazyModuleGetter(this, "Rect",
  "resource://gre/modules/Geometry.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Direction",
  "resource://spatialnavigation/Direction.jsm");

const focusManager  = Services.focus;
const { FLAG_BYMOUSE } = focusManager;

this.DOMInfo = function DOMInfo(aElem) {
  return {
    get isRemoteBrowserFrame() { return isRemoteBrowserFrame(aElem); },
    get isFocusable()          { return isFocusable(aElem); },
    isInViewport,
    isScrollable,
    scrollIntoViewIfNeeded()   { return scrollIntoViewIfNeeded(aElem); },
    getBoundingRect(aWindow)   { return getBoundingRect(aElem, aWindow); },
    getContentRect,
  }

  function isInViewport(aFully = false) {
    if (!(aElem instanceof nsIDOMElement)) return false;

    const {innerHeight, innerWidth} = aElem.ownerDocument.defaultView;
    const viewportRect = new Rect(0, 0, innerWidth, innerHeight);
    const boundingRect = getBoundingRect(aElem);

    return aFully ? viewportRect.contains(boundingRect) :
                    viewportRect.intersects(boundingRect);
  }

  function isScrollable(aDirection, aIgnoreOverflowProp = false) {
    if (aElem instanceof nsIDOMWindow) {
      aElem = aElem.document.documentElement;
    }

    if (!(aElem instanceof nsIDOMHTMLElement)) return false;

    const {scrollLeft, scrollLeftMax, scrollTop, scrollTopMax} = aElem;

    let scrollable = false;
    switch (aDirection) {
      case Direction.left:
      case Direction.right:
      case Direction.up:
      case Direction.down:
        scrollable = isScrollableDirection(aDirection);
        break;
      default:
        scrollable = isScrollableDirection(Direction.left)  ||
                     isScrollableDirection(Direction.right) ||
                     isScrollableDirection(Direction.up)    ||
                     isScrollableDirection(Direction.down);
        break;
    }

    function isScrollableDirection(aDir) {
      switch (aDir) {
        case Direction.left:
          return 0 < scrollLeft;
        case Direction.right:
          return scrollLeft < scrollLeftMax;
        case Direction.up:
          return 0 < scrollTop;
        case Direction.down:
          return scrollTop < scrollTopMax;
      }
      return false;
    }

    function showOverflow() {
      if (!aIgnoreOverflowProp) {
        const style = aElem.ownerDocument.defaultView.getComputedStyle(aElem);

        let value = style.overflow;
        if (value === 'hidden' || value === '-moz-hidden-unscrollable') {
          return false;
        }

        switch (aDirection) {
          case Direction.left:
          case Direction.right:
            value = style['overflow-x'];
            break;
          case Direction.up:
          case Direction.down:
            value = style['overflow-y'];
            break;
          default:
            value = null;
            break;
        }
        return value !== 'hidden';
      }
      return true;
    }

    return scrollable && showOverflow(aElem);
  }

  function getContentRect(aWindow) {
    const rect = getBoundingRect(aElem, aWindow);

    const {contentWindow} = aElem;
    const style = contentWindow && contentWindow.getComputedStyle(aElem, null);

    // In some cases, the computed style is null
    if (!style) return rect;

    function parseProperty(aProp) {
      return parseInt(style.getPropertyValue(aProp));
    }
    const paddingTop    = parseProperty("padding-top");
    const paddingBottom = parseProperty("padding-bottom");
    const paddingLeft   = parseProperty("padding-left");
    const paddingRight  = parseProperty("padding-right");

    const borderTop    = parseProperty("border-top-width");
    const borderBottom = parseProperty("border-bottom-width");
    const borderLeft   = parseProperty("border-left-width");
    const borderRight  = parseProperty("border-right-width");

    rect.translate(paddingLeft + borderLeft, paddingTop + borderTop);

    rect.width  -= (paddingLeft + borderLeft + paddingRight + borderRight);
    rect.height -= (paddingTop + borderTop + paddingBottom + borderBottom);

    return rect;
  }
}

DOMInfo.getRootWindowOfProcess =
function getRootWindowOfProcess(aWindow = null, aIncludeChromeWindow = false) {
  let window = aWindow ||
               Services.ww.activeWindow ||
               focusManager.activeWindow ||
               Services.wm.getMostRecentWindow(null);

  // When child process frame is not focused, both focus.focusedWindow and
  // wm.getMostRecentWindow return null.
  if (!window) {
    const i = Services.ww.getWindowEnumerator();
    if (i.hasMoreElements()) window = i.getNext();
  }

  if (!window) return null;


  window = window.QueryInterface(nsIInterfaceRequestor)
                 .getInterface(nsIWebNavigation)
                 .QueryInterface(nsIDocShellTreeItem)
                 .rootTreeItem
                 .QueryInterface(nsIDocShell)
                 .contentViewer
                 .DOMDocument
                 .defaultView;

  if (!aIncludeChromeWindow && window instanceof nsIDOMChromeWindow) {
    try {
      window = window.content ||      // nsIContentFrameMessageManager
               window.shell           // for B2G main process
                     .contentBrowser
                     .contentWindow;
    } catch (e) {
      console.error("Failed to get content window from", window);
      window = null;
    }
  }

  return window;
}

DOMInfo.extractFocusableNodesInfo =
function extractFocusableNodesInfo(aWindow, aRect,
                                   aBlackList = new WeakSet(),
                                   aDx = 0, aDy = 0) {
  const {left, top, width, height} = aRect;
  const nodes = aWindow.QueryInterface(nsIInterfaceRequestor)
                       .getInterface(nsIDOMWindowUtils)
                       .nodesFromRect(left,  top,    0,
                                      width, height, 0,
                                      true, true);

  const nodeInfo = new Map();
  for (let i=0; i <= nodes.length; ++i) {
    const node = nodes.item(i);
    if (!(node && node instanceof nsIDOMElement) ||
        aBlackList.has(node)) {
      continue;
    }

    if (!isFocusable(node)) {
      aBlackList.add(node);
      continue;
    }

    if (node instanceof nsIDOMHTMLIFrameElement &&
        !isRemoteBrowserFrame(node)) {
      const contentRect = DOMInfo(node).getContentRect();

      const searchRect = contentRect.intersect(aRect);
      if (!searchRect) continue;

      const {x, y} = contentRect;
      const {contentWindow} = node;
      const {innerWidth, innerHeight} = contentWindow;
      const iframeNodes = extractFocusableNodesInfo(contentWindow,
                              new Rect(0, 0, innerWidth, innerHeight),
                              aBlackList,
                              aDx + x,
                              aDy + y);
      if (iframeNodes.size) {
        iframeNodes.forEach((nodeRect, iframeNode) => {
          if (searchRect.intersects(nodeRect)) {
            nodeInfo.set(iframeNode, nodeRect)
          }
        });
      } else {
        const iframeContentHtml = node.contentDocument.documentElement;
        if (DOMInfo(iframeContentHtml).isScrollable()) {
          nodeInfo.set(iframeContentHtml, contentRect.translate(aDx, aDy));
        }
      }
    } else {
      nodeInfo.set(node, getBoundingRect(node).translate(aDx, aDy));
    }
  }

  return nodeInfo;
}

var scrollBehavior = "auto";
Object.defineProperty(DOMInfo, "scrollBehavior", {
  get() { return scrollBehavior; },
  set(aBehavior) {
    switch (aBehavior) {
      case "auto":
      case "instant":
      case "smooth":
        scrollBehavior = aBehavior;
    }
  }
});

DOMInfo.scrollOffset =
function scrollOffset(aWindow,
                      aDirection = null,
                      aIgnoreWindowBounds = false) {
  if (!aWindow) return null;

  const { innerWidth,
          innerHeight,
          document: {
            documentElement: {
              scrollLeft,
              scrollLeftMax,
              scrollTop,
              scrollTopMax
            }
          }
        } = aWindow;

  let [x, y] = [innerWidth, innerHeight].map(v => Math.round(v * .2));

  const {left, right, up, down} = Direction;

  switch(aDirection) {
    case left:
    case right:
      y = 0;
      break;
    case up:
    case down:
      x = 0;
      break;
  }

  switch(aDirection) {
    case left:
      x = - (aIgnoreWindowBounds ? x : Math.min(scrollLeft, x));
      break;
    case right:
      x = aIgnoreWindowBounds ? x : Math.min(scrollLeftMax - scrollLeft, x);
      break;
    case up:
      y = - (aIgnoreWindowBounds ? y : Math.min(scrollTop, y));
      break;
    case down:
      y = aIgnoreWindowBounds ? y : Math.min(scrollTopMax - scrollTop, y);
      break
  }

  return [x, y];
}

DOMInfo.getSearchRect =
function getSearchRect(aWindow, aFocusedRect, aDirection) {
  const {left, right, up, down} = Direction;

  const wide = getSearchBoundary(aWindow, aDirection);
  if (!wide|| wide.isEmpty()) return null;

  switch (aDirection) {
    case left:
      wide.right = aFocusedRect.left - 1;
      break;
    case right:
      wide.left = aFocusedRect.right + 1;
      break;
    case up:
      wide.bottom = aFocusedRect.top - 1;
      break;
    case down:
      wide.top = aFocusedRect.bottom + 1;
      break;
    default:
      return null;
  }
  if (wide.isEmpty()) return null;

  const narrow = wide.clone();

  switch (aDirection) {
    case left:
    case right:
      narrow.top = aFocusedRect.top;
      narrow.bottom = aFocusedRect.bottom - 1;
      break;
    case up:
    case down:
      narrow.left = aFocusedRect.left;
      narrow.right = aFocusedRect.right - 1;
      break;
  }

  return {narrow, wide};
}

////////////////////////////////////////////////////////////////////////////////
function isRemoteBrowserFrame(aElem) {
  if (aElem instanceof nsIDOMHTMLIFrameElement && aElem.mozbrowser) {
    const remoteAttr = aElem.getAttribute("remote");
    if (remoteAttr && remoteAttr.toLowerCase() !== "false") return true;
  }
  return false;
}

/**
 * Returns true if the node is a type that we want to focus, false otherwise.
 * See : http://www.w3.org/TR/html5/editing.html#focusable
 * @param  {nsIDOMElement} node
 * @return {boolean}
 */
function isFocusable(node) {
  let document = node.ownerDocument;
  if (!document) return false;

  if (document.mozFullScreen && !document.mozFullScreenElement.contains(node)) {
    return false;
  }

  if (node instanceof nsIDOMHTMLBodyElement) return false;

  // Exceptionally, we give a focus to a node
  // which has contenteditable and designMode turned on.
  if ((node instanceof nsIDOMHTMLElement && node.isContentEditable) ||
      document.designMode === "on") {
    return true;
  }

  // The element's tabindex focus flag is set.
  if (!focusManager.elementIsFocusable(node, FLAG_BYMOUSE)) {
    return false;
  }

  // Additionally, we should not allow the element to be reached
  // if the element's tabIndex value is a negative integer.
  // http://www.w3.org/TR/html5/editing.html#attr-tabindex
  if (node.tabIndex < 0) {
    return false;
  }

  // It is being rendered node if it has any associated CSS layout boxes.
  let {width, height} = node.getBoundingClientRect();
  if (!(width && height)) {
    // Check it is a descendant of a canvas element.
    for (let n = node; n != null; n = n.parentNode) {
      if (n instanceof nsIDOMHTMLCanvasElement) {
        return true;
      }
    }
    // This is not being rendered or
    // is not a descendant of canvas element either.
    return false;
  }

  // The element is not inert.
  // HTML5 Inert attribute is not yet supported. Bug 921504.
  return true;
}

function scrollIntoViewIfNeeded(aElem) {
  const window = aElem.ownerDocument.defaultView;

  let [dx, dy] = scrollOffsetIntoView(aElem);
  if (dx || dy) {
    window.scrollBy({left:dx, top:dy, behavior:scrollBehavior});
  }

  if (window === DOMInfo.getRootWindowOfProcess(window)) {
    const frameElement = window.QueryInterface(nsIInterfaceRequestor)
                               .getInterface(nsIDOMWindowUtils)
                               .containerElement;

    if (frameElement) {
      const [dxFrame, dyFrame] = scrollIntoViewIfNeeded(frameElement);
      dx += dxFrame;
      dy += dyFrame;
    }
  }

  return [dx, dy];
}

function scrollOffsetIntoView(aElem) {
  const {innerWidth, innerHeight} = aElem.ownerDocument.defaultView;
  const {left, top, right, bottom} = aElem.getBoundingClientRect();
  const {offsetWidth, offsetHeight} =  aElem;

  let x = 0, y = 0;

  let bottomToTop = top - innerHeight;
  if (bottom <= offsetHeight) {
    y = bottom - offsetHeight;
  } else if (-offsetHeight <= bottomToTop) {
    y = bottomToTop + offsetHeight;
  }

  let rightToLeft = left - innerWidth;
  if (right <= offsetWidth) {
    x = right - offsetWidth;
  } else if (-offsetWidth <= rightToLeft) {
    x = rightToLeft + offsetWidth;
  }

  return [x, y].map(Math.round);
}

function getBoundingRect(aSource, aWindow) {
  if (aSource instanceof nsIDOMElement) {
    const {left, top, width, height} = aSource.getBoundingClientRect();
    const rect =  new Rect(left, top, width, height);

    if (aWindow instanceof nsIDOMWindow) {
      let iframe;
      const {document} = aWindow;
      for (let {ownerDocument} = aSource;
           ownerDocument !== document;
           {ownerDocument} = iframe) {
        iframe = ownerDocument.defaultView.realFrameElement;
        const {x, y} = DOMInfo(iframe).getContentRect();
        rect.translate(x, y);
      }
    }

    return rect;
  } else if (aSource instanceof nsIDOMClientRect) {
    let {left, top, width, height} = aSource;
    return new Rect(left, top, width, height);
  }

  throw new Error(aSource);
}

function getSearchBoundary(aWindow, aDirection) {
  if (!aWindow) return null;
  const {innerWidth, innerHeight} = aWindow;
  if (!(innerWidth && innerHeight)) return null;

  const windowRect = new Rect(0, 0, innerWidth - 1, innerHeight - 1);
  return windowRect.clone()
                   .translate(...DOMInfo.scrollOffset(aWindow, aDirection))
                   .union(windowRect);
}

