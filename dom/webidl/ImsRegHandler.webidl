/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

enum ImsProfile {
  "cellular-preferred",
  "cellular-only",
  "wifi-preferred",
  "wifi-only"
 };

enum ImsCapability {
  "voice-over-cellular",
  "voice-over-wifi",
  "video-over-cellular",
  "video-over-wifi"
};

[Pref="dom.mobileconnection.enabled"]
interface ImsRegHandler : EventTarget {
  /**
   * Set IMS feature enabled/disabled.
   *
   * @param enabled
   *        True to enable IMS feature.
   *
   * @return a Promise
   *         Fulfilled if success.
   *         Rejected with error message, otherwise.
   */
  [Throws]
  Promise<void> setEnabled(boolean enabled);

  /**
   * Current enabled state of IMS.
   */
  [Throws]
  readonly attribute boolean enabled;

  /**
   * Set preferred IMS profile.
   *
   * @param profile
   *        The preferred ImsProfile to be applied.
   *
   * @return a Promise
   *         Fulfilled if success.
   *         Rejected with error message, otherwise.
   */
  [Throws]
  Promise<void> setPreferredProfile(ImsProfile profile);

  /**
   * The preferred IMS profile currently applied.
   */
  [Throws]
  readonly attribute ImsProfile preferredProfile;

  /**
   * Current IMS capability if IMS is registered.
   * Will be null if *not* registered.
   */
  readonly attribute ImsCapability? capability;

  /**
   * The error cause if IMS is *not* registered.
   * Will be null if IMS is registered.
   */
  readonly attribute DOMString? unregisteredReason;

  /**
   * Triggered whenever the value of |capability| or
   * |unregisteredReason| is changed.
   *
   * With this asumption, it's possible to receive this event
   * multiple times with different reasons while the capability
   * remained unchanged.
   */
  attribute EventHandler oncapabilitychange;
};