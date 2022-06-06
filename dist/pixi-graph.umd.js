(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('pixi.js')) :
  typeof define === 'function' && define.amd ? define(['exports', 'pixi.js'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.PixiGraph = {}, global.PIXI));
}(this, (function (exports, PIXI) { 'use strict';

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () {
              return e[k];
            }
          });
        }
      });
    }
    n['default'] = e;
    return Object.freeze(n);
  }

  var PIXI__namespace = /*#__PURE__*/_interopNamespace(PIXI);

  var WHITE$1 = 0xffffff;
  exports.TextType = void 0;
  (function (TextType) {
      TextType["TEXT"] = "TEXT";
      TextType["BITMAP_TEXT"] = "BITMAP_TEXT";
      // TODO: SDF_TEXT
      // see https://github.com/PixelsCommander/pixi-sdf-text/issues/12
  })(exports.TextType || (exports.TextType = {}));
  function textToPixi(type, content, style) {
      var text;
      if (type === exports.TextType.TEXT) {
          // TODO: convert to bitmap font with PIXI.BitmapFont.from?
          text = new PIXI__namespace.Text(content, {
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fill: WHITE$1
          });
      }
      else if (type === exports.TextType.BITMAP_TEXT) {
          text = new PIXI__namespace.BitmapText(content, {
              fontName: style.fontFamily,
              fontSize: style.fontSize
          });
      }
      else {
          throw new Error('Invalid state');
      }
      text.roundPixels = true;
      return text;
  }

  /*! *****************************************************************************
  Copyright (c) Microsoft Corporation.

  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.

  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** */
  /* global Reflect, Promise */

  var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf ||
          ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
          function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
      return extendStatics(d, b);
  };

  function __extends(d, b) {
      if (typeof b !== "function" && b !== null)
          throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
      extendStatics(d, b);
      function __() { this.constructor = d; }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  }

  /**
   * @typedef ViewportTouch
   * @property {number} id
   * @property {PIXI.Point} last
  */

  /**
   * handles all input for Viewport
   * @private
   */
  class InputManager {
      constructor(viewport) {
          this.viewport = viewport;

          /**
           * list of active touches on viewport
           * @type {ViewportTouch[]}
           */
          this.touches = [];
          this.addListeners();
      }

      /**
       * add input listeners
       * @private
       */
      addListeners() {
          this.viewport.interactive = true;
          if (!this.viewport.forceHitArea) {
              this.viewport.hitArea = new PIXI.Rectangle(0, 0, this.viewport.worldWidth, this.viewport.worldHeight);
          }
          this.viewport.on('pointerdown', this.down, this);
          this.viewport.on('pointermove', this.move, this);
          this.viewport.on('pointerup', this.up, this);
          this.viewport.on('pointerupoutside', this.up, this);
          this.viewport.on('pointercancel', this.up, this);
          this.viewport.on('pointerout', this.up, this);
          this.wheelFunction = (e) => this.handleWheel(e);
          this.viewport.options.divWheel.addEventListener('wheel', this.wheelFunction, { passive: this.viewport.options.passiveWheel });
          this.isMouseDown = false;
      }

      /**
       * removes all event listeners from viewport
       * (useful for cleanup of wheel when removing viewport)
       */
      destroy() {
          this.viewport.options.divWheel.removeEventListener('wheel', this.wheelFunction);
      }

      /**
       * handle down events for viewport
       * @param {PIXI.InteractionEvent} event
       */
      down(event) {
          if (this.viewport.pause || !this.viewport.worldVisible) {
              return
          }
          if (event.data.pointerType === 'mouse') {
              this.isMouseDown = true;
          }
          else if (!this.get(event.data.pointerId)) {
              this.touches.push({ id: event.data.pointerId, last: null });
          }
          if (this.count() === 1) {
              this.last = event.data.global.clone();

              // clicked event does not fire if viewport is decelerating or bouncing
              const decelerate = this.viewport.plugins.get('decelerate', true);
              const bounce = this.viewport.plugins.get('bounce', true);
              if ((!decelerate || !decelerate.isActive()) && (!bounce || !bounce.isActive())) {
                  this.clickedAvailable = true;
              }
              else {
                  this.clickedAvailable = false;
              }
          }
          else {
              this.clickedAvailable = false;
          }

          const stop = this.viewport.plugins.down(event);
          if (stop && this.viewport.options.stopPropagation) {
              event.stopPropagation();
          }
      }

      /**
       * clears all pointer events
       */
      clear() {
          this.isMouseDown = false;
          this.touches = [];
          this.last = null;
      }

      /**
       * @param {number} change
       * @returns whether change exceeds threshold
       */
      checkThreshold(change) {
          if (Math.abs(change) >= this.viewport.threshold) {
              return true
          }
          return false
      }

      /**
       * handle move events for viewport
       * @param {PIXI.InteractionEvent} event
       */
      move(event) {
          if (this.viewport.pause || !this.viewport.worldVisible) {
              return
          }

          const stop = this.viewport.plugins.move(event);

          if (this.clickedAvailable) {
              const distX = event.data.global.x - this.last.x;
              const distY = event.data.global.y - this.last.y;
              if (this.checkThreshold(distX) || this.checkThreshold(distY)) {
                  this.clickedAvailable = false;
              }
          }

          if (stop && this.viewport.options.stopPropagation) {
              event.stopPropagation();
          }
      }

      /**
       * handle up events for viewport
       * @param {PIXI.InteractionEvent} event
       */
      up(event) {
          if (this.viewport.pause || !this.viewport.worldVisible) {
              return
          }

          if (event.data.pointerType === 'mouse') {
              this.isMouseDown = false;
          }

          if (event.data.pointerType !== 'mouse') {
              this.remove(event.data.pointerId);
          }

          const stop = this.viewport.plugins.up(event);

          if (this.clickedAvailable && this.count() === 0) {
              this.viewport.emit('clicked', { event: event, screen: this.last, world: this.viewport.toWorld(this.last), viewport: this });
              this.clickedAvailable = false;
          }

          if (stop && this.viewport.options.stopPropagation) {
              event.stopPropagation();
          }
      }

      /**
       * gets pointer position if this.interaction is set
       * @param {WheelEvent} event
       * @return {PIXI.Point}
       */
      getPointerPosition(event) {
          let point = new PIXI.Point();
          if (this.viewport.options.interaction) {
              this.viewport.options.interaction.mapPositionToPoint(point, event.clientX, event.clientY);
          }
          else {
              point.x = event.clientX;
              point.y = event.clientY;
          }
          return point
      }

      /**
       * handle wheel events
       * @param {WheelEvent} event
       */
      handleWheel(event) {
          if (this.viewport.pause || !this.viewport.worldVisible) {
              return
          }

          // do not handle events coming from other elements
          if (this.viewport.options.interaction && this.viewport.options.interaction.interactionDOMElement !== event.target) {
              return
          }

          // only handle wheel events where the mouse is over the viewport
          const point = this.viewport.toLocal(this.getPointerPosition(event));
          if (this.viewport.left <= point.x && point.x <= this.viewport.right && this.viewport.top <= point.y && point.y <= this.viewport.bottom) {
              const stop = this.viewport.plugins.wheel(event);
              if (stop && !this.viewport.options.passiveWheel) {
                  event.preventDefault();
              }
          }
      }

      pause() {
          this.touches = [];
          this.isMouseDown = false;
      }

      /**
       * get touch by id
       * @param {number} id
       * @return {ViewportTouch}
       */
      get(id) {
          for (let touch of this.touches) {
              if (touch.id === id) {
                  return touch
              }
          }
          return null
      }

      /**
       * remove touch by number
       * @param {number} id
       */
      remove(id) {
          for (let i = 0; i < this.touches.length; i++) {
              if (this.touches[i].id === id) {
                  this.touches.splice(i, 1);
                  return
              }
          }
      }

      /**
       * @returns {number} count of mouse/touch pointers that are down on the viewport
       */
      count() {
          return (this.isMouseDown ? 1 : 0) + this.touches.length
      }
  }

  const PLUGIN_ORDER = ['drag', 'pinch', 'wheel', 'follow', 'mouse-edges', 'decelerate', 'aniamte', 'bounce', 'snap-zoom', 'clamp-zoom', 'snap', 'clamp'];

  /**
   * Use this to access current plugins or add user-defined plugins
   */
  class PluginManager {
      /**
       * instantiated by Viewport
       * @param {Viewport} viewport
       */
      constructor(viewport) {
          this.viewport = viewport;
          this.list = [];
          this.plugins = {};
      }

      /**
       * Inserts a named plugin or a user plugin into the viewport
       * default plugin order: 'drag', 'pinch', 'wheel', 'follow', 'mouse-edges', 'decelerate', 'bounce', 'snap-zoom', 'clamp-zoom', 'snap', 'clamp'
       * @param {string} name of plugin
       * @param {Plugin} plugin - instantiated Plugin class
       * @param {number} index to insert userPlugin (otherwise inserts it at the end)
       */
      add(name, plugin, index = PLUGIN_ORDER.length) {
          this.plugins[name] = plugin;
          const current = PLUGIN_ORDER.indexOf(name);
          if (current !== -1) {
              PLUGIN_ORDER.splice(current, 1);
          }
          PLUGIN_ORDER.splice(index, 0, name);
          this.sort();
      }

      /**
       * get plugin
       * @param {string} name of plugin
       * @param {boolean} [ignorePaused] return null if plugin is paused
       * @return {Plugin}
       */
      get(name, ignorePaused) {
          if (ignorePaused) {
              if (this.plugins[name] && this.plugins[name].paused) {
                  return null
              }
          }
          return this.plugins[name]
      }

      /**
       * update all active plugins
       * @ignore
       * @param {number} elapsed type in milliseconds since last update
       */
      update(elapsed) {
          for (let plugin of this.list) {
              plugin.update(elapsed);
          }
      }

      /**
       * resize all active plugins
       * @ignore
       */
      resize() {
          for (let plugin of this.list) {
              plugin.resize();
          }
      }

      /**
       * clamps and resets bounce and decelerate (as needed) after manually moving viewport
       */
      reset() {
          for (let plugin of this.list) {
              plugin.reset();
          }
      }

      /** removes all installed plugins */
      removeAll() {
          this.plugins = {};
          this.sort();
      }

      /**
       * removes installed plugin
       * @param {string} name of plugin (e.g., 'drag', 'pinch')
       */
      remove(name) {
          if (this.plugins[name]) {
              delete this.plugins[name];
              this.viewport.emit(name + '-remove');
              this.sort();
          }
      }

      /**
       * pause plugin
       * @param {string} name of plugin (e.g., 'drag', 'pinch')
       */
      pause(name) {
          if (this.plugins[name]) {
              this.plugins[name].pause();
          }
      }

      /**
       * resume plugin
       * @param {string} name of plugin (e.g., 'drag', 'pinch')
       */
      resume(name) {
          if (this.plugins[name]) {
              this.plugins[name].resume();
          }
      }

      /**
       * sort plugins according to PLUGIN_ORDER
       * @ignore
       */
      sort() {
          this.list = [];
          for (let plugin of PLUGIN_ORDER) {
              if (this.plugins[plugin]) {
                  this.list.push(this.plugins[plugin]);
              }
          }
      }

      /**
       * handle down for all plugins
       * @ignore
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      down(event) {
          let stop = false;
          for (let plugin of this.list) {
              if (plugin.down(event)) {
                  stop = true;
              }
          }
          return stop
      }

      /**
       * handle move for all plugins
       * @ignore
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      move(event) {
          let stop = false;
          for (let plugin of this.viewport.plugins.list) {
              if (plugin.move(event)) {
                  stop = true;
              }
          }
          return stop
      }

      /**
       * handle up for all plugins
       * @ignore
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      up(event) {
          let stop = false;
          for (let plugin of this.list) {
              if (plugin.up(event)) {
                  stop = true;
              }
          }
          return stop
      }

      /**
       * handle wheel event for all plugins
       * @ignore
       * @param {WheelEvent} event
       * @returns {boolean}
       */
      wheel(e) {
          let result = false;
          for (let plugin of this.list) {
              if (plugin.wheel(e)) {
                  result = true;
              }
          }
          return result
      }
  }

  /**
   * derive this class to create user-defined plugins
   */
  class Plugin {
      /**
       * @param {Viewport} parent
       */
      constructor(parent) {
          this.parent = parent;
          this.paused = false;
      }

      /** called when plugin is removed */
      destroy() {}

      /**
       * handler for pointerdown PIXI event
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      down() {
          return false
      }

      /**
       * handler for pointermove PIXI event
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      move() {
          return false
      }

      /**
       * handler for pointerup PIXI event
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      up() {
          return false
      }

      /**
       * handler for wheel event on div
       * @param {WheelEvent} event
       * @returns {boolean}
       */
      wheel() {
          return false
      }

      /**
       * called on each tick
       * @param {number} elapsed time in millisecond since last update
       */
      update() { }

      /** called when the viewport is resized */
      resize() { }

      /** called when the viewport is manually moved */
      reset() { }

      /** pause the plugin */
      pause() {
          this.paused = true;
      }

      /** un-pause the plugin */
      resume() {
          this.paused = false;
      }
  }

  /**
   * @typedef {object} LastDrag
   * @property {number} x
   * @property {number} y
   * @property {PIXI.Point} parent
   */

  /**
   * @typedef DragOptions
   * @property {string} [direction=all] direction to drag
   * @property {boolean} [pressDrag=true] whether click to drag is active
   * @property {boolean} [wheel=true] use wheel to scroll in direction (unless wheel plugin is active)
   * @property {number} [wheelScroll=1] number of pixels to scroll with each wheel spin
   * @property {boolean} [reverse] reverse the direction of the wheel scroll
   * @property {(boolean|string)} [clampWheel=false] clamp wheel(to avoid weird bounce with mouse wheel)
   * @property {string} [underflow=center] where to place world if too small for screen
   * @property {number} [factor=1] factor to multiply drag to increase the speed of movement
   * @property {string} [mouseButtons=all] changes which mouse buttons trigger drag, use: 'all', 'left', right' 'middle', or some combination, like, 'middle-right'; you may want to set viewport.options.disableOnContextMenu if you want to use right-click dragging
   * @property {string[]} [keyToPress=null] array containing {@link key|https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code} codes of keys that can be pressed for the drag to be triggered, e.g.: ['ShiftLeft', 'ShiftRight'}.
   * @property {boolean} [ignoreKeyToPressOnTouch=false] ignore keyToPress for touch events
   * @property {number} [lineHeight=20] scaling factor for non-DOM_DELTA_PIXEL scrolling events
   */

  const dragOptions = {
      direction: 'all',
      pressDrag: true,
      wheel: true,
      wheelScroll: 1,
      reverse: false,
      clampWheel: false,
      underflow: 'center',
      factor: 1,
      mouseButtons: 'all',
      keyToPress: null,
      ignoreKeyToPressOnTouch: false,
      lineHeight: 20,
  };

  /**
   * @private
   */
  class Drag extends Plugin {
      /**
       * @param {Viewport} parent
       * @param {DragOptions} options
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, dragOptions, options);
          this.moved = false;
          this.reverse = this.options.reverse ? 1 : -1;
          this.xDirection = !this.options.direction || this.options.direction === 'all' || this.options.direction === 'x';
          this.yDirection = !this.options.direction || this.options.direction === 'all' || this.options.direction === 'y';
          this.keyIsPressed = false;

          this.parseUnderflow();
          this.mouseButtons(this.options.mouseButtons);
          if (this.options.keyToPress) {
              this.handleKeyPresses(this.options.keyToPress);
          }
      }

      /**
       * Handles keypress events and set the keyIsPressed boolean accordingly
       * @param {array} codes - key codes that can be used to trigger drag event
       */
      handleKeyPresses(codes) {
          window.addEventListener('keydown', e => {
              if (codes.includes(e.code))
                  this.keyIsPressed = true;
          });

          window.addEventListener('keyup', e => {
              if (codes.includes(e.code))
                  this.keyIsPressed = false;
          });
      }

      /**
       * initialize mousebuttons array
       * @param {string} buttons
       */
      mouseButtons(buttons) {
          if (!buttons || buttons === 'all') {
              this.mouse = [true, true, true];
          } else {
              this.mouse = [
                  buttons.indexOf('left') === -1 ? false : true,
                  buttons.indexOf('middle') === -1 ? false : true,
                  buttons.indexOf('right') === -1 ? false : true
              ];
          }
      }

      parseUnderflow() {
          const clamp = this.options.underflow.toLowerCase();
          if (clamp === 'center') {
              this.underflowX = 0;
              this.underflowY = 0;
          } else {
              this.underflowX = (clamp.indexOf('left') !== -1) ? -1 : (clamp.indexOf('right') !== -1) ? 1 : 0;
              this.underflowY = (clamp.indexOf('top') !== -1) ? -1 : (clamp.indexOf('bottom') !== -1) ? 1 : 0;
          }
      }

      /**
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      checkButtons(event) {
          const isMouse = event.data.pointerType === 'mouse';
          const count = this.parent.input.count();
          if ((count === 1) || (count > 1 && !this.parent.plugins.get('pinch', true))) {
              if (!isMouse || this.mouse[event.data.button]) {
                  return true
              }
          }
          return false
      }

      /**
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      checkKeyPress(event) {
          if (!this.options.keyToPress || this.keyIsPressed || (this.options.ignoreKeyToPressOnTouch && event.data.pointerType === 'touch'))
              return true

          return false
      }

      /**
       * @param {PIXI.InteractionEvent} event
       */
      down(event) {
          if (this.paused || !this.options.pressDrag) {
              return
          }
          if (this.checkButtons(event) && this.checkKeyPress(event)) {
              this.last = { x: event.data.global.x, y: event.data.global.y };
              this.current = event.data.pointerId;
              return true
          } else {
              this.last = null;
          }
      }

      get active() {
          return this.moved
      }

      /**
       * @param {PIXI.InteractionEvent} event
       */
      move(event) {
          if (this.paused || !this.options.pressDrag) {
              return
          }
          if (this.last && this.current === event.data.pointerId) {
              const x = event.data.global.x;
              const y = event.data.global.y;
              const count = this.parent.input.count();
              if (count === 1 || (count > 1 && !this.parent.plugins.get('pinch', true))) {
                  const distX = x - this.last.x;
                  const distY = y - this.last.y;
                  if (this.moved || ((this.xDirection && this.parent.input.checkThreshold(distX)) || (this.yDirection && this.parent.input.checkThreshold(distY)))) {
                      const newPoint = { x, y };
                      if (this.xDirection) {
                          this.parent.x += (newPoint.x - this.last.x) * this.options.factor;
                      }
                      if (this.yDirection) {
                          this.parent.y += (newPoint.y - this.last.y) * this.options.factor;
                      }
                      this.last = newPoint;
                      if (!this.moved) {
                          this.parent.emit('drag-start', { event: event, screen: new PIXI.Point(this.last.x, this.last.y), world: this.parent.toWorld(new PIXI.Point(this.last.x, this.last.y)), viewport: this.parent });
                      }
                      this.moved = true;
                      this.parent.emit('moved', { viewport: this.parent, type: 'drag' });
                      return true
                  }
              } else {
                  this.moved = false;
              }
          }
      }

      /**
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      up(event) {
          if (this.paused) {
              return
          }
          const touches = this.parent.input.touches;
          if (touches.length === 1) {
              const pointer = touches[0];
              if (pointer.last) {
                  this.last = { x: pointer.last.x, y: pointer.last.y };
                  this.current = pointer.id;
              }
              this.moved = false;
              return true
          } else if (this.last) {
              if (this.moved) {
                  const screen = new PIXI.Point(this.last.x, this.last.y);
                  this.parent.emit('drag-end', { event: event, screen, world: this.parent.toWorld(screen), viewport: this.parent });
                  this.last = null;
                  this.moved = false;
                  return true
              }
          }
      }

      /**
       * @param {WheelEvent} event
       * @returns {boolean}
       */
      wheel(event) {
          if (this.paused) {
              return
          }

          if (this.options.wheel) {
              const wheel = this.parent.plugins.get('wheel', true);
              if (!wheel) {
                  const step = event.deltaMode ? this.options.lineHeight : 1;
                  if (this.xDirection) {
                      this.parent.x += event.deltaX * step * this.options.wheelScroll * this.reverse;
                  }
                  if (this.yDirection) {
                      this.parent.y += event.deltaY * step * this.options.wheelScroll * this.reverse;
                  }
                  if (this.options.clampWheel) {
                      this.clamp();
                  }
                  this.parent.emit('wheel-scroll', this.parent);
                  this.parent.emit('moved', { viewport: this.parent, type: 'wheel' });
                  if (!this.parent.options.passiveWheel) {
                      event.preventDefault();
                  }
                  return true
              }
          }
      }

      resume() {
          this.last = null;
          this.paused = false;
      }

      clamp() {
          const decelerate = this.parent.plugins.get('decelerate', true) || {};
          if (this.options.clampWheel !== 'y') {
              if (this.parent.screenWorldWidth < this.parent.screenWidth) {
                  switch (this.underflowX) {
                  case -1:
                      this.parent.x = 0;
                      break
                  case 1:
                      this.parent.x = (this.parent.screenWidth - this.parent.screenWorldWidth);
                      break
                  default:
                      this.parent.x = (this.parent.screenWidth - this.parent.screenWorldWidth) / 2;
                  }
              } else {
                  if (this.parent.left < 0) {
                      this.parent.x = 0;
                      decelerate.x = 0;
                  } else if (this.parent.right > this.parent.worldWidth) {
                      this.parent.x = -this.parent.worldWidth * this.parent.scale.x + this.parent.screenWidth;
                      decelerate.x = 0;
                  }
              }
          }
          if (this.options.clampWheel !== 'x') {
              if (this.parent.screenWorldHeight < this.parent.screenHeight) {
                  switch (this.underflowY) {
                  case -1:
                      this.parent.y = 0;
                      break
                  case 1:
                      this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight);
                      break
                  default:
                      this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight) / 2;
                  }
              } else {
                  if (this.parent.top < 0) {
                      this.parent.y = 0;
                      decelerate.y = 0;
                  }
                  if (this.parent.bottom > this.parent.worldHeight) {
                      this.parent.y = -this.parent.worldHeight * this.parent.scale.y + this.parent.screenHeight;
                      decelerate.y = 0;
                  }
              }
          }
      }
  }

  /**
   * @typedef {object} PinchOptions
   * @property {boolean} [noDrag] disable two-finger dragging
   * @property {number} [percent=1] percent to modify pinch speed
   * @property {number} [factor=1] factor to multiply two-finger drag to increase the speed of movement
   * @property {PIXI.Point} [center] place this point at center during zoom instead of center of two fingers
   * @property {('all'|'x'|'y')} [axis=all] axis to zoom
   */

  const pinchOptions = {
      noDrag: false,
      percent: 1,
      center: null,
      factor: 1,
      axis: 'all',
  };

  class Pinch extends Plugin {
      /**
       * @private
       * @param {Viewport} parent
       * @param {PinchOptions} [options]
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, pinchOptions, options);
      }

      down() {
          if (this.parent.input.count() >= 2) {
              this.active = true;
              return true
          }
      }

      isAxisX() {
          return ['all', 'x'].includes(this.options.axis)
      }

      isAxisY() {
          return ['all', 'y'].includes(this.options.axis)
      }

      move(e) {
          if (this.paused || !this.active) {
              return
          }

          const x = e.data.global.x;
          const y = e.data.global.y;

          const pointers = this.parent.input.touches;
          if (pointers.length >= 2) {
              const first = pointers[0];
              const second = pointers[1];
              const last = (first.last && second.last) ? Math.sqrt(Math.pow(second.last.x - first.last.x, 2) + Math.pow(second.last.y - first.last.y, 2)) : null;
              if (first.id === e.data.pointerId) {
                  first.last = { x, y, data: e.data };
              }
              else if (second.id === e.data.pointerId) {
                  second.last = { x, y, data: e.data };
              }
              if (last) {
                  let oldPoint;
                  const point = { x: first.last.x + (second.last.x - first.last.x) / 2, y: first.last.y + (second.last.y - first.last.y) / 2 };
                  if (!this.options.center) {
                      oldPoint = this.parent.toLocal(point);
                  }
                  let dist = Math.sqrt(Math.pow(second.last.x - first.last.x, 2) + Math.pow(second.last.y - first.last.y, 2));
                  dist = dist === 0 ? dist = 0.0000000001 : dist;
                  const change = (1 - last / dist) * this.options.percent * (this.isAxisX() ? this.parent.scale.x : this.parent.scale.y);
                  if (this.isAxisX()) {
                      this.parent.scale.x += change;
                  }
                  if (this.isAxisY()) {
                      this.parent.scale.y += change;
                  }
                  this.parent.emit('zoomed', { viewport: this.parent, type: 'pinch', center: point });
                  const clamp = this.parent.plugins.get('clamp-zoom', true);
                  if (clamp) {
                      clamp.clamp();
                  }
                  if (this.options.center) {
                      this.parent.moveCenter(this.options.center);
                  }
                  else {
                      const newPoint = this.parent.toGlobal(oldPoint);
                      this.parent.x += (point.x - newPoint.x) * this.options.factor;
                      this.parent.y += (point.y - newPoint.y) * this.options.factor;
                      this.parent.emit('moved', { viewport: this.parent, type: 'pinch' });
                  }
                  if (!this.options.noDrag && this.lastCenter) {
                      this.parent.x += (point.x - this.lastCenter.x) * this.options.factor;
                      this.parent.y += (point.y - this.lastCenter.y) * this.options.factor;
                      this.parent.emit('moved', { viewport: this.parent, type: 'pinch' });
                  }
                  this.lastCenter = point;
                  this.moved = true;
              }
              else {
                  if (!this.pinching) {
                      this.parent.emit('pinch-start', this.parent);
                      this.pinching = true;
                  }
              }
              return true
          }
      }

      up() {
          if (this.pinching) {
              if (this.parent.input.touches.length <= 1) {
                  this.active = false;
                  this.lastCenter = null;
                  this.pinching = false;
                  this.moved = false;
                  this.parent.emit('pinch-end', this.parent);
                  return true
              }
          }
      }
  }

  /**
   * There are three ways to clamp:
   * 1. direction: 'all' = the world is clamped to its world boundaries, ie, you cannot drag any part of the world offscreen
   *    direction: 'x' | 'y' = only the x or y direction is clamped to its world boundary
   * 2. left, right, top, bottom = true | number = the world is clamped to the world's pixel location for each side;
   *    if any of these are set to true, then the location is set to the boundary [0, viewport.worldWidth/viewport.worldHeight]
   *    eg: to allow the world to be completely dragged offscreen, set [-viewport.worldWidth, -viewport.worldHeight, viewport.worldWidth * 2, viewport.worldHeight * 2]
   *
   * Underflow determines what happens when the world is smaller than the viewport
   * 1. none = the world is clamped but there is no special behavior
   * 2. center = the world is centered on the viewport
   * 3. combination of top/bottom/center and left/right/center (case insensitive) = the world is stuck to the appropriate boundaries
   *
   * @typedef ClampOptions
   * @property {(number|boolean)} [left=false] clamp left; true = 0
   * @property {(number|boolean)} [right=false] clamp right; true = viewport.worldWidth
   * @property {(number|boolean)} [top=false] clamp top; true = 0
   * @property {(number|boolean)} [bottom=false] clamp bottom; true = viewport.worldHeight
   * @property {string} [direction] (all, x, or y) using clamps of [0, viewport.worldWidth/viewport.worldHeight]; replaces left/right/top/bottom if set
   * @property {string} [underflow=center] where to place world if too small for screen (e.g., top-right, center, none, bottomleft)
   */

  const clampOptions =
  {
      left: false,
      right: false,
      top: false,
      bottom: false,
      direction: null,
      underflow: 'center'
  };

  class Clamp extends Plugin
  {
      /**
       * @private
       * @param {Viewport} parent
       * @param {ClampOptions} [options]
       */
      constructor(parent, options={})
      {
          super(parent);
          this.options = Object.assign({}, clampOptions, options);
          if (this.options.direction)
          {
              this.options.left = this.options.direction === 'x' || this.options.direction === 'all' ? true : null;
              this.options.right = this.options.direction === 'x' || this.options.direction === 'all' ? true : null;
              this.options.top = this.options.direction === 'y' || this.options.direction === 'all' ? true : null;
              this.options.bottom = this.options.direction === 'y' || this.options.direction === 'all' ? true : null;
          }
          this.parseUnderflow();
          this.last = { x: null, y: null, scaleX: null, scaleY: null };
          this.update();
      }

      parseUnderflow()
      {
          const clamp = this.options.underflow.toLowerCase();
          if (clamp === 'none')
          {
              this.noUnderflow = true;
          }
          else if (clamp === 'center')
          {
              this.underflowX = this.underflowY = 0;
              this.noUnderflow = false;
          }
          else
          {
              this.underflowX = (clamp.indexOf('left') !== -1) ? -1 : (clamp.indexOf('right') !== -1) ? 1 : 0;
              this.underflowY = (clamp.indexOf('top') !== -1) ? -1 : (clamp.indexOf('bottom') !== -1) ? 1 : 0;
              this.noUnderflow = false;
          }
      }

      /**
       * handle move events
       * @param {PIXI.InteractionEvent} event
       * @returns {boolean}
       */
      move()
      {
          this.update();
          return false
      }

      update()
      {
          if (this.paused)
          {
              return
          }

          // only clamp on change
          if (this.parent.x === this.last.x && this.parent.y === this.last.y && this.parent.scale.x === this.last.scaleX && this.parent.scale.y === this.last.scaleY)
          {
              return
          }
          const original = { x: this.parent.x, y: this.parent.y };
          const decelerate = this.parent.plugins['decelerate'] || {};
          if (this.options.left !== null || this.options.right !== null)
          {
              let moved = false;
              if (!this.noUnderflow && this.parent.screenWorldWidth < this.parent.screenWidth)
              {
                  switch (this.underflowX)
                  {
                      case -1:
                          if (this.parent.x !== 0)
                          {
                              this.parent.x = 0;
                              moved = true;
                          }
                          break
                      case 1:
                          if (this.parent.x !== this.parent.screenWidth - this.parent.screenWorldWidth)
                          {
                              this.parent.x = this.parent.screenWidth - this.parent.screenWorldWidth;
                              moved = true;
                          }
                          break
                      default:
                          if (this.parent.x !== (this.parent.screenWidth - this.parent.screenWorldWidth) / 2)
                          {
                              this.parent.x = (this.parent.screenWidth - this.parent.screenWorldWidth) / 2;
                              moved = true;
                          }
                  }
              }
              else
              {
                  if (this.options.left !== null)
                  {
                      if (this.parent.left < (this.options.left === true ? 0 : this.options.left))
                      {
                          this.parent.x = -(this.options.left === true ? 0 : this.options.left) * this.parent.scale.x;
                          decelerate.x = 0;
                          moved = true;
                      }
                  }
                  if (this.options.right !== null)
                  {
                      if (this.parent.right > (this.options.right === true ? this.parent.worldWidth : this.options.right))
                      {
                          this.parent.x = -(this.options.right === true ? this.parent.worldWidth : this.options.right) * this.parent.scale.x + this.parent.screenWidth;
                          decelerate.x = 0;
                          moved = true;
                      }
                  }
              }
              if (moved)
              {
                  this.parent.emit('moved', { viewport: this.parent, original, type: 'clamp-x' });
              }
          }
          if (this.options.top !== null || this.options.bottom !== null)
          {
              let moved = false;
              if (!this.noUnderflow && this.parent.screenWorldHeight < this.parent.screenHeight)
              {
                  switch (this.underflowY)
                  {
                      case -1:
                          if (this.parent.y !== 0)
                          {
                              this.parent.y = 0;
                              moved = true;
                          }
                          break
                      case 1:
                          if (this.parent.y !== this.parent.screenHeight - this.parent.screenWorldHeight)
                          {
                              this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight);
                              moved = true;
                          }
                          break
                      default:
                          if (this.parent.y !== (this.parent.screenHeight - this.parent.screenWorldHeight) / 2)
                          {
                              this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight) / 2;
                              moved = true;
                          }
                  }
              }
              else
              {
                  if (this.options.top !== null)
                  {
                      if (this.parent.top < (this.options.top === true ? 0 : this.options.top))
                      {
                          this.parent.y = -(this.options.top === true ? 0 : this.options.top) * this.parent.scale.y;
                          decelerate.y = 0;
                          moved = true;
                      }
                  }
                  if (this.options.bottom !== null)
                  {
                      if (this.parent.bottom > (this.options.bottom === true ? this.parent.worldHeight : this.options.bottom))
                      {
                          this.parent.y = -(this.options.bottom === true ? this.parent.worldHeight : this.options.bottom) * this.parent.scale.y + this.parent.screenHeight;
                          decelerate.y = 0;
                          moved = true;
                      }
                  }
              }
              if (moved)
              {
                  this.parent.emit('moved', { viewport: this.parent, original, type: 'clamp-y' });
              }
          }
          this.last.x = this.parent.x;
          this.last.y = this.parent.y;
          this.last.scaleX = this.parent.scale.x;
          this.last.scaleY = this.parent.scale.y;
      }

      reset()
      {
          this.update();
      }
  }

  /**
   * use either minimum width/height or minimum scale
   * @typedef {object} ClampZoomOptions
   * @property {number} [minWidth] minimum width
   * @property {number} [minHeight] minimum height
   * @property {number} [maxWidth] maximum width
   * @property {number} [maxHeight] maximum height
   * @property {number} [minScale] minimum scale
   * @property {number} [maxScale] minimum scale
   */

  const clampZoomOptions = {
      minWidth: null,
      minHeight: null,
      maxWidth: null,
      maxHeight: null,
      minScale: null,
      maxScale: null
  };

  class ClampZoom extends Plugin
  {
      /**
       * @private
       * @param {Viewport} parent
       * @param {ClampZoomOptions} [options]
       */
      constructor(parent, options={})
      {
          super(parent);
          this.options = Object.assign({}, clampZoomOptions, options);
          this.clamp();
      }

      resize()
      {
          this.clamp();
      }

      clamp()
      {
          if (this.paused)
          {
              return
          }

          if (this.options.minWidth || this.options.minHeight || this.options.maxWidth || this.options.maxHeight)
          {
              let width = this.parent.worldScreenWidth;
              let height = this.parent.worldScreenHeight;
              if (this.options.minWidth !== null && width < this.options.minWidth)
              {
                  const original = this.parent.scale.x;
                  this.parent.fitWidth(this.options.minWidth, false, false, true);
                  this.parent.scale.y *= this.parent.scale.x / original;
                  width = this.parent.worldScreenWidth;
                  height = this.parent.worldScreenHeight;
                  this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
              }
              if (this.options.maxWidth !== null && width > this.options.maxWidth)
              {
                  const original = this.parent.scale.x;
                  this.parent.fitWidth(this.options.maxWidth, false, false, true);
                  this.parent.scale.y *= this.parent.scale.x / original;
                  width = this.parent.worldScreenWidth;
                  height = this.parent.worldScreenHeight;
                  this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
              }
              if (this.options.minHeight !== null && height < this.options.minHeight)
              {
                  const original = this.parent.scale.y;
                  this.parent.fitHeight(this.options.minHeight, false, false, true);
                  this.parent.scale.x *= this.parent.scale.y / original;
                  width = this.parent.worldScreenWidth;
                  height = this.parent.worldScreenHeight;
                  this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
              }
              if (this.options.maxHeight !== null && height > this.options.maxHeight)
              {
                  const original = this.parent.scale.y;
                  this.parent.fitHeight(this.options.maxHeight, false, false, true);
                  this.parent.scale.x *= this.parent.scale.y / original;
                  this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
              }
          }
          else
          {
              let scale = this.parent.scale.x;
              if (this.options.minScale !== null && scale < this.options.minScale)
              {
                  scale = this.options.minScale;
              }
              if (this.options.maxScale !== null && scale > this.options.maxScale)
              {
                  scale = this.options.maxScale;
              }
              if (scale !== this.parent.scale.x) {
                  this.parent.scale.set(scale);
                  this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
              }
          }
      }

      reset()
      {
          this.clamp();
      }
  }

  /**
   * @typedef {object} DecelerateOptions
   * @property {number} [friction=0.95] percent to decelerate after movement
   * @property {number} [bounce=0.8] percent to decelerate when past boundaries (only applicable when viewport.bounce() is active)
   * @property {number} [minSpeed=0.01] minimum velocity before stopping/reversing acceleration
   */

  const decelerateOptions = {
      friction: 0.98,
      bounce: 0.8,
      minSpeed: 0.01
  };

  /**
   * Time period of decay (1 frame)
   */
  const TP = 16;

  class Decelerate extends Plugin {
      /**
       * @private
       * @param {Viewport} parent
       * @param {DecelerateOptions} [options]
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, decelerateOptions, options);
          this.saved = [];
          this.timeSinceRelease = 0;
          this.reset();
          this.parent.on('moved', data => this.moved(data));
      }

      destroy() {
          this.parent;
      }

      down() {
          this.saved = [];
          this.x = this.y = false;
      }

      isActive() {
          return this.x || this.y
      }

      move() {
          if (this.paused) {
              return
          }

          const count = this.parent.input.count();
          if (count === 1 || (count > 1 && !this.parent.plugins.get('pinch', true))) {
              this.saved.push({ x: this.parent.x, y: this.parent.y, time: performance.now() });
              if (this.saved.length > 60) {
                  this.saved.splice(0, 30);
              }
          }
      }

      moved(data) {
          if (this.saved.length) {
              const last = this.saved[this.saved.length - 1];
              if (data.type === 'clamp-x') {
                  if (last.x === data.original.x) {
                      last.x = this.parent.x;
                  }
              }
              else if (data.type === 'clamp-y') {
                  if (last.y === data.original.y) {
                      last.y = this.parent.y;
                  }
              }
          }
      }

      up() {
          if (this.parent.input.count() === 0 && this.saved.length) {
              const now = performance.now();
              for (let save of this.saved) {
                  if (save.time >= now - 100) {
                      const time = now - save.time;
                      this.x = (this.parent.x - save.x) / time;
                      this.y = (this.parent.y - save.y) / time;
                      this.percentChangeX = this.percentChangeY = this.options.friction;
                      this.timeSinceRelease = 0;
                      break
                  }
              }
          }
      }

      /**
       * manually activate plugin
       * @param {object} options
       * @param {number} [options.x]
       * @param {number} [options.y]
       */
      activate(options) {
          options = options || {};
          if (typeof options.x !== 'undefined') {
              this.x = options.x;
              this.percentChangeX = this.options.friction;
          }
          if (typeof options.y !== 'undefined') {
              this.y = options.y;
              this.percentChangeY = this.options.friction;
          }
      }

      update(elapsed) {
          if (this.paused) {
              return
          }

          /*
           * See https://github.com/davidfig/pixi-viewport/issues/271 for math.
           *
           * The viewport velocity (this.x, this.y) decays expoenential by the the decay factor
           * (this.percentChangeX, this.percentChangeY) each frame. This velocity function is integrated
           * to calculate the displacement.
           */

          const moved = this.x || this.y;

          const ti = this.timeSinceRelease;
          const tf = this.timeSinceRelease + elapsed;

          if (this.x) {
              const k = this.percentChangeX;
              const lnk = Math.log(k);

              this.parent.x += ((this.x * TP) / lnk) * (Math.pow(k, tf / TP) - Math.pow(k, ti / TP));
          }
          if (this.y) {
              const k = this.percentChangeY;
              const lnk = Math.log(k);

              this.parent.y += ((this.y * TP) / lnk) * (Math.pow(k, tf / TP) - Math.pow(k, ti / TP));
          }

          this.timeSinceRelease += elapsed;
          this.x *= Math.pow(this.percentChangeX, elapsed / TP);
          this.y *= Math.pow(this.percentChangeY, elapsed / TP);

          if (Math.abs(this.x) < this.options.minSpeed) {
              this.x = 0;
          }
          if (Math.abs(this.y) < this.options.minSpeed) {
              this.y = 0;
          }

          if (moved) {
              this.parent.emit('moved', { viewport: this.parent, type: 'decelerate' });
          }
      }

      reset() {
          this.x = this.y = null;
      }
  }

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule$1(fn) {
    var module = { exports: {} };
  	return fn(module, module.exports), module.exports;
  }

  var penner = createCommonjsModule$1(function (module, exports) {
  /*
  	Copyright © 2001 Robert Penner
  	All rights reserved.

  	Redistribution and use in source and binary forms, with or without modification, 
  	are permitted provided that the following conditions are met:

  	Redistributions of source code must retain the above copyright notice, this list of 
  	conditions and the following disclaimer.
  	Redistributions in binary form must reproduce the above copyright notice, this list 
  	of conditions and the following disclaimer in the documentation and/or other materials 
  	provided with the distribution.

  	Neither the name of the author nor the names of contributors may be used to endorse 
  	or promote products derived from this software without specific prior written permission.

  	THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
  	EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
  	MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
  	COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
  	EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
  	GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
  	AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
  	NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
  	OF THE POSSIBILITY OF SUCH DAMAGE.
   */

  (function() {
    var penner, umd;

    umd = function(factory) {
      {
        return module.exports = factory;
      }
    };

    penner = {
      linear: function(t, b, c, d) {
        return c * t / d + b;
      },
      easeInQuad: function(t, b, c, d) {
        return c * (t /= d) * t + b;
      },
      easeOutQuad: function(t, b, c, d) {
        return -c * (t /= d) * (t - 2) + b;
      },
      easeInOutQuad: function(t, b, c, d) {
        if ((t /= d / 2) < 1) {
          return c / 2 * t * t + b;
        } else {
          return -c / 2 * ((--t) * (t - 2) - 1) + b;
        }
      },
      easeInCubic: function(t, b, c, d) {
        return c * (t /= d) * t * t + b;
      },
      easeOutCubic: function(t, b, c, d) {
        return c * ((t = t / d - 1) * t * t + 1) + b;
      },
      easeInOutCubic: function(t, b, c, d) {
        if ((t /= d / 2) < 1) {
          return c / 2 * t * t * t + b;
        } else {
          return c / 2 * ((t -= 2) * t * t + 2) + b;
        }
      },
      easeInQuart: function(t, b, c, d) {
        return c * (t /= d) * t * t * t + b;
      },
      easeOutQuart: function(t, b, c, d) {
        return -c * ((t = t / d - 1) * t * t * t - 1) + b;
      },
      easeInOutQuart: function(t, b, c, d) {
        if ((t /= d / 2) < 1) {
          return c / 2 * t * t * t * t + b;
        } else {
          return -c / 2 * ((t -= 2) * t * t * t - 2) + b;
        }
      },
      easeInQuint: function(t, b, c, d) {
        return c * (t /= d) * t * t * t * t + b;
      },
      easeOutQuint: function(t, b, c, d) {
        return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
      },
      easeInOutQuint: function(t, b, c, d) {
        if ((t /= d / 2) < 1) {
          return c / 2 * t * t * t * t * t + b;
        } else {
          return c / 2 * ((t -= 2) * t * t * t * t + 2) + b;
        }
      },
      easeInSine: function(t, b, c, d) {
        return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
      },
      easeOutSine: function(t, b, c, d) {
        return c * Math.sin(t / d * (Math.PI / 2)) + b;
      },
      easeInOutSine: function(t, b, c, d) {
        return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
      },
      easeInExpo: function(t, b, c, d) {
        if (t === 0) {
          return b;
        } else {
          return c * Math.pow(2, 10 * (t / d - 1)) + b;
        }
      },
      easeOutExpo: function(t, b, c, d) {
        if (t === d) {
          return b + c;
        } else {
          return c * (-Math.pow(2, -10 * t / d) + 1) + b;
        }
      },
      easeInOutExpo: function(t, b, c, d) {
        if ((t /= d / 2) < 1) {
          return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
        } else {
          return c / 2 * (-Math.pow(2, -10 * --t) + 2) + b;
        }
      },
      easeInCirc: function(t, b, c, d) {
        return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
      },
      easeOutCirc: function(t, b, c, d) {
        return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
      },
      easeInOutCirc: function(t, b, c, d) {
        if ((t /= d / 2) < 1) {
          return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
        } else {
          return c / 2 * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
        }
      },
      easeInElastic: function(t, b, c, d) {
        var a, p, s;
        s = 1.70158;
        p = 0;
        a = c;
        if (t === 0) ; else if ((t /= d) === 1) ;
        if (!p) {
          p = d * .3;
        }
        if (a < Math.abs(c)) {
          a = c;
          s = p / 4;
        } else {
          s = p / (2 * Math.PI) * Math.asin(c / a);
        }
        return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
      },
      easeOutElastic: function(t, b, c, d) {
        var a, p, s;
        s = 1.70158;
        p = 0;
        a = c;
        if (t === 0) ; else if ((t /= d) === 1) ;
        if (!p) {
          p = d * .3;
        }
        if (a < Math.abs(c)) {
          a = c;
          s = p / 4;
        } else {
          s = p / (2 * Math.PI) * Math.asin(c / a);
        }
        return a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p) + c + b;
      },
      easeInOutElastic: function(t, b, c, d) {
        var a, p, s;
        s = 1.70158;
        p = 0;
        a = c;
        if (t === 0) ; else if ((t /= d / 2) === 2) ;
        if (!p) {
          p = d * (.3 * 1.5);
        }
        if (a < Math.abs(c)) {
          a = c;
          s = p / 4;
        } else {
          s = p / (2 * Math.PI) * Math.asin(c / a);
        }
        if (t < 1) {
          return -.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
        } else {
          return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p) * .5 + c + b;
        }
      },
      easeInBack: function(t, b, c, d, s) {
        if (s === void 0) {
          s = 1.70158;
        }
        return c * (t /= d) * t * ((s + 1) * t - s) + b;
      },
      easeOutBack: function(t, b, c, d, s) {
        if (s === void 0) {
          s = 1.70158;
        }
        return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
      },
      easeInOutBack: function(t, b, c, d, s) {
        if (s === void 0) {
          s = 1.70158;
        }
        if ((t /= d / 2) < 1) {
          return c / 2 * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
        } else {
          return c / 2 * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
        }
      },
      easeInBounce: function(t, b, c, d) {
        var v;
        v = penner.easeOutBounce(d - t, 0, c, d);
        return c - v + b;
      },
      easeOutBounce: function(t, b, c, d) {
        if ((t /= d) < 1 / 2.75) {
          return c * (7.5625 * t * t) + b;
        } else if (t < 2 / 2.75) {
          return c * (7.5625 * (t -= 1.5 / 2.75) * t + .75) + b;
        } else if (t < 2.5 / 2.75) {
          return c * (7.5625 * (t -= 2.25 / 2.75) * t + .9375) + b;
        } else {
          return c * (7.5625 * (t -= 2.625 / 2.75) * t + .984375) + b;
        }
      },
      easeInOutBounce: function(t, b, c, d) {
        var v;
        if (t < d / 2) {
          v = penner.easeInBounce(t * 2, 0, c, d);
          return v * .5 + b;
        } else {
          v = penner.easeOutBounce(t * 2 - d, 0, c, d);
          return v * .5 + c * .5 + b;
        }
      }
    };

    umd(penner);

  }).call(commonjsGlobal);
  });

  /**
   * returns correct Penner equation using string or Function
   * @param {(function|string)} [ease]
   * @param {defaults} default penner equation to use if none is provided
   */
  function ease(ease, defaults)
  {
      if (!ease)
      {
          return penner[defaults]
      }
      else if (typeof ease === 'function')
      {
          return ease
      }
      else if (typeof ease === 'string')
      {
          return penner[ease]
      }
  }

  /**
   * @typedef {options} BounceOptions
   * @property {string} [sides=all] all, horizontal, vertical, or combination of top, bottom, right, left (e.g., 'top-bottom-right')
   * @property {number} [friction=0.5] friction to apply to decelerate if active
   * @property {number} [time=150] time in ms to finish bounce
   * @property {object} [bounceBox] use this bounceBox instead of (0, 0, viewport.worldWidth, viewport.worldHeight)
   * @property {number} [bounceBox.x=0]
   * @property {number} [bounceBox.y=0]
   * @property {number} [bounceBox.width=viewport.worldWidth]
   * @property {number} [bounceBox.height=viewport.worldHeight]
   * @property {string|function} [ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
   * @property {string} [underflow=center] (top/bottom/center and left/right/center, or center) where to place world if too small for screen
   */

  const bounceOptions = {
      sides: 'all',
      friction: 0.5,
      time: 150,
      ease: 'easeInOutSine',
      underflow: 'center',
      bounceBox: null
  };

  class Bounce extends Plugin {
      /**
       * @private
       * @param {Viewport} parent
       * @param {BounceOptions} [options]
       * @fires bounce-start-x
       * @fires bounce.end-x
       * @fires bounce-start-y
       * @fires bounce-end-y
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, bounceOptions, options);
          this.ease = ease(this.options.ease, 'easeInOutSine');
          if (this.options.sides) {
              if (this.options.sides === 'all') {
                  this.top = this.bottom = this.left = this.right = true;
              }
              else if (this.options.sides === 'horizontal') {
                  this.right = this.left = true;
              }
              else if (this.options.sides === 'vertical') {
                  this.top = this.bottom = true;
              }
              else {
                  this.top = this.options.sides.indexOf('top') !== -1;
                  this.bottom = this.options.sides.indexOf('bottom') !== -1;
                  this.left = this.options.sides.indexOf('left') !== -1;
                  this.right = this.options.sides.indexOf('right') !== -1;
              }
          }
          this.parseUnderflow();
          this.last = {};
          this.reset();
      }

      parseUnderflow() {
          const clamp = this.options.underflow.toLowerCase();
          if (clamp === 'center') {
              this.underflowX = 0;
              this.underflowY = 0;
          }
          else {
              this.underflowX = (clamp.indexOf('left') !== -1) ? -1 : (clamp.indexOf('right') !== -1) ? 1 : 0;
              this.underflowY = (clamp.indexOf('top') !== -1) ? -1 : (clamp.indexOf('bottom') !== -1) ? 1 : 0;
          }
      }

      isActive() {
          return this.toX !== null || this.toY !== null
      }

      down() {
          this.toX = this.toY = null;
      }

      up() {
          this.bounce();
      }

      update(elapsed) {
          if (this.paused) {
              return
          }

          this.bounce();
          if (this.toX) {
              const toX = this.toX;
              toX.time += elapsed;
              this.parent.emit('moved', { viewport: this.parent, type: 'bounce-x' });
              if (toX.time >= this.options.time) {
                  this.parent.x = toX.end;
                  this.toX = null;
                  this.parent.emit('bounce-x-end', this.parent);
              }
              else {
                  this.parent.x = this.ease(toX.time, toX.start, toX.delta, this.options.time);
              }
          }
          if (this.toY) {
              const toY = this.toY;
              toY.time += elapsed;
              this.parent.emit('moved', { viewport: this.parent, type: 'bounce-y' });
              if (toY.time >= this.options.time) {
                  this.parent.y = toY.end;
                  this.toY = null;
                  this.parent.emit('bounce-y-end', this.parent);
              }
              else {
                  this.parent.y = this.ease(toY.time, toY.start, toY.delta, this.options.time);
              }
          }
      }

      calcUnderflowX() {
          let x;
          switch (this.underflowX) {
              case -1:
                  x = 0;
                  break
              case 1:
                  x = (this.parent.screenWidth - this.parent.screenWorldWidth);
                  break
              default:
                  x = (this.parent.screenWidth - this.parent.screenWorldWidth) / 2;
          }
          return x
      }

      calcUnderflowY() {
          let y;
          switch (this.underflowY) {
              case -1:
                  y = 0;
                  break
              case 1:
                  y = (this.parent.screenHeight - this.parent.screenWorldHeight);
                  break
              default:
                  y = (this.parent.screenHeight - this.parent.screenWorldHeight) / 2;
          }
          return y
      }

      oob() {
          const box = this.options.bounceBox;
          if (box) {
              const x1 = typeof box.x === 'undefined' ? 0 : box.x;
              const y1 = typeof box.y === 'undefined' ? 0 : box.y;
              const width = typeof box.width === 'undefined' ? this.parent.worldWidth : box.width;
              const height = typeof box.height === 'undefined' ? this.parent.worldHeight : box.height;
              return {
                  left: this.parent.left < x1,
                  right: this.parent.right > width,
                  top: this.parent.top < y1,
                  bottom: this.parent.bottom > height,
                  topLeft: new PIXI.Point(
                      x1 * this.parent.scale.x,
                      y1 * this.parent.scale.y
                  ),
                  bottomRight: new PIXI.Point(
                      width * this.parent.scale.x - this.parent.screenWidth,
                      height * this.parent.scale.y - this.parent.screenHeight
                  )
              }
          }
          return {
              left: this.parent.left < 0,
              right: this.parent.right > this.parent.worldWidth,
              top: this.parent.top < 0,
              bottom: this.parent.bottom > this.parent.worldHeight,
              topLeft: new PIXI.Point(0, 0),
              bottomRight: new PIXI.Point(
                  this.parent.worldWidth * this.parent.scale.x - this.parent.screenWidth,
                  this.parent.worldHeight * this.parent.scale.y - this.parent.screenHeight
              )
          }
      }

      bounce() {
          if (this.paused) {
              return
          }

          let oob;
          let decelerate = this.parent.plugins.get('decelerate', true);
          if (decelerate && (decelerate.x || decelerate.y)) {
              if ((decelerate.x && decelerate.percentChangeX === decelerate.options.friction) || (decelerate.y && decelerate.percentChangeY === decelerate.options.friction)) {
                  oob = this.oob();
                  if ((oob.left && this.left) || (oob.right && this.right)) {
                      decelerate.percentChangeX = this.options.friction;
                  }
                  if ((oob.top && this.top) || (oob.bottom && this.bottom)) {
                      decelerate.percentChangeY = this.options.friction;
                  }
              }
          }
          const drag = this.parent.plugins.get('drag', true) || {};
          const pinch = this.parent.plugins.get('pinch', true) || {};
          decelerate = decelerate || {};
          if (!drag.active && !pinch.active && ((!this.toX || !this.toY) && (!decelerate.x || !decelerate.y))) {
              oob = oob || this.oob();
              const topLeft = oob.topLeft;
              const bottomRight = oob.bottomRight;
              if (!this.toX && !decelerate.x) {
                  let x = null;
                  if (oob.left && this.left) {
                      x = (this.parent.screenWorldWidth < this.parent.screenWidth) ? this.calcUnderflowX() : -topLeft.x;
                  }
                  else if (oob.right && this.right) {
                      x = (this.parent.screenWorldWidth < this.parent.screenWidth) ? this.calcUnderflowX() : -bottomRight.x;
                  }
                  if (x !== null && this.parent.x !== x) {
                      this.toX = { time: 0, start: this.parent.x, delta: x - this.parent.x, end: x };
                      this.parent.emit('bounce-x-start', this.parent);
                  }
              }
              if (!this.toY && !decelerate.y) {
                  let y = null;
                  if (oob.top && this.top) {
                      y = (this.parent.screenWorldHeight < this.parent.screenHeight) ? this.calcUnderflowY() : -topLeft.y;
                  }
                  else if (oob.bottom && this.bottom) {
                      y = (this.parent.screenWorldHeight < this.parent.screenHeight) ? this.calcUnderflowY() : -bottomRight.y;
                  }
                  if (y !== null && this.parent.y !== y) {
                      this.toY = { time: 0, start: this.parent.y, delta: y - this.parent.y, end: y };
                      this.parent.emit('bounce-y-start', this.parent);
                  }
              }
          }
      }

      reset() {
          this.toX = this.toY = null;
          this.bounce();
      }
  }

  /**
   * @typedef SnapOptions
   * @property {boolean} [topLeft] snap to the top-left of viewport instead of center
   * @property {number} [friction=0.8] friction/frame to apply if decelerate is active
   * @property {number} [time=1000]
   * @property {string|function} [ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
   * @property {boolean} [interrupt=true] pause snapping with any user input on the viewport
   * @property {boolean} [removeOnComplete] removes this plugin after snapping is complete
   * @property {boolean} [removeOnInterrupt] removes this plugin if interrupted by any user input
   * @property {boolean} [forceStart] starts the snap immediately regardless of whether the viewport is at the desired location
   */

  const snapOptions = {
      topLeft: false,
      friction: 0.8,
      time: 1000,
      ease: 'easeInOutSine',
      interrupt: true,
      removeOnComplete: false,
      removeOnInterrupt: false,
      forceStart: false
  };

  class Snap extends Plugin {
      /**
       * @private
       * @param {Viewport} parent
       * @param {number} x
       * @param {number} y
       * @param {SnapOptions} [options]
       * @event snap-start(Viewport) emitted each time a snap animation starts
       * @event snap-restart(Viewport) emitted each time a snap resets because of a change in viewport size
       * @event snap-end(Viewport) emitted each time snap reaches its target
       * @event snap-remove(Viewport) emitted if snap plugin is removed
       */
      constructor(parent, x, y, options = {}) {
          super(parent);
          this.options = Object.assign({}, snapOptions, options);
          this.ease = ease(options.ease, 'easeInOutSine');
          this.x = x;
          this.y = y;
          if (this.options.forceStart) {
              this.snapStart();
          }
      }

      snapStart() {
          this.percent = 0;
          this.snapping = { time: 0 };
          const current = this.options.topLeft ? this.parent.corner : this.parent.center;
          this.deltaX = this.x - current.x;
          this.deltaY = this.y - current.y;
          this.startX = current.x;
          this.startY = current.y;
          this.parent.emit('snap-start', this.parent);
      }

      wheel() {
          if (this.options.removeOnInterrupt) {
              this.parent.plugins.remove('snap');
          }
      }

      down() {
          if (this.options.removeOnInterrupt) {
              this.parent.plugins.remove('snap');
          }
          else if (this.options.interrupt) {
              this.snapping = null;
          }
      }

      up() {
          if (this.parent.input.count() === 0) {
              const decelerate = this.parent.plugins.get('decelerate', true);
              if (decelerate && (decelerate.x || decelerate.y)) {
                  decelerate.percentChangeX = decelerate.percentChangeY = this.options.friction;
              }
          }
      }

      update(elapsed) {
          if (this.paused) {
              return
          }
          if (this.options.interrupt && this.parent.input.count() !== 0) {
              return
          }
          if (!this.snapping) {
              const current = this.options.topLeft ? this.parent.corner : this.parent.center;
              if (current.x !== this.x || current.y !== this.y) {
                  this.snapStart();
              }
          }
          else {
              const snapping = this.snapping;
              snapping.time += elapsed;
              let finished, x, y;
              if (snapping.time > this.options.time) {
                  finished = true;
                  x = this.startX + this.deltaX;
                  y = this.startY + this.deltaY;
              }
              else {
                  const percent = this.ease(snapping.time, 0, 1, this.options.time);
                  x = this.startX + this.deltaX * percent;
                  y = this.startY + this.deltaY * percent;
              }
              if (this.options.topLeft) {
                  this.parent.moveCorner(x, y);
              }
              else {
                  this.parent.moveCenter(x, y);
              }
              this.parent.emit('moved', { viewport: this.parent, type: 'snap' });
              if (finished) {
                  if (this.options.removeOnComplete) {
                      this.parent.plugins.remove('snap');
                  }
                  this.parent.emit('snap-end', this.parent);
                  this.snapping = null;
              }
          }
      }
  }

  /**
   * @typedef {Object} SnapZoomOptions
   * @property {number} [width=0] the desired width to snap (to maintain aspect ratio, choose only width or height)
   * @property {number} [height=0] the desired height to snap (to maintain aspect ratio, choose only width or height)
   * @property {number} [time=1000] time for snapping in ms
   * @property {(string|function)} [ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
   * @property {PIXI.Point} [center] place this point at center during zoom instead of center of the viewport
   * @property {boolean} [interrupt=true] pause snapping with any user input on the viewport
   * @property {boolean} [removeOnComplete] removes this plugin after snapping is complete
   * @property {boolean} [removeOnInterrupt] removes this plugin if interrupted by any user input
   * @property {boolean} [forceStart] starts the snap immediately regardless of whether the viewport is at the desired zoom
   * @property {boolean} [noMove] zoom but do not move
   */

  const snapZoomOptions = {
      width: 0,
      height: 0,
      time: 1000,
      ease: 'easeInOutSine',
      center: null,
      interrupt: true,
      removeOnComplete: false,
      removeOnInterrupts: false,
      forceStart: false,
      noMove: false
  };

  class SnapZoom extends Plugin {
      /**
       * @param {Viewport} parent
       * @param {SnapZoomOptions} options
       * @event snap-zoom-start(Viewport) emitted each time a fit animation starts
       * @event snap-zoom-end(Viewport) emitted each time fit reaches its target
       * @event snap-zoom-end(Viewport) emitted each time fit reaches its target
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, snapZoomOptions, options);
          this.ease = ease(this.options.ease);
          if (this.options.width > 0) {
              this.xScale = parent.screenWidth / this.options.width;
          }
          if (this.options.height > 0) {
              this.yScale = parent.screenHeight / this.options.height;
          }
          this.xIndependent = this.xScale ? true : false;
          this.yIndependent = this.yScale ? true : false;
          this.xScale = this.xIndependent ? this.xScale : this.yScale;
          this.yScale = this.yIndependent ? this.yScale : this.xScale;

          if (this.options.time === 0) {
              parent.container.scale.x = this.xScale;
              parent.container.scale.y = this.yScale;
              if (this.options.removeOnComplete) {
                  this.parent.plugins.remove('snap-zoom');
              }
          }
          else if (options.forceStart) {
              this.createSnapping();
          }
      }

      createSnapping() {
          this.parent.scale;
          const startWorldScreenWidth = this.parent.worldScreenWidth;
          const startWorldScreenHeight = this.parent.worldScreenHeight;
          const endWorldScreenWidth = this.parent.screenWidth / this.xScale;
          const endWorldScreenHeight = this.parent.screenHeight / this.yScale;
          
          this.snapping = { 
              time: 0, 
              startX: startWorldScreenWidth, 
              startY: startWorldScreenHeight, 
              deltaX: endWorldScreenWidth - startWorldScreenWidth, 
              deltaY: endWorldScreenHeight - startWorldScreenHeight 
          };
          this.parent.emit('snap-zoom-start', this.parent);
      }

      resize() {
          this.snapping = null;

          if (this.options.width > 0) {
              this.xScale = this.parent.screenWidth / this.options.width;
          }
          if (this.options.height > 0) {
              this.yScale = this.parent.screenHeight / this.options.height;
          }
          this.xScale = this.xIndependent ? this.xScale : this.yScale;
          this.yScale = this.yIndependent ? this.yScale : this.xScale;
      }

      wheel() {
          if (this.options.removeOnInterrupt) {
              this.parent.plugins.remove('snap-zoom');
          }
      }

      down() {
          if (this.options.removeOnInterrupt) {
              this.parent.plugins.remove('snap-zoom');
          }
          else if (this.options.interrupt) {
              this.snapping = null;
          }
      }

      update(elapsed) {
          if (this.paused) {
              return
          }
          if (this.options.interrupt && this.parent.input.count() !== 0) {
              return
          }

          let oldCenter;
          if (!this.options.center && !this.options.noMove) {
              oldCenter = this.parent.center;
          }
          if (!this.snapping) {
              if (this.parent.scale.x !== this.xScale || this.parent.scale.y !== this.yScale) {
                  this.createSnapping();
              }
          }
          else if (this.snapping) {
              const snapping = this.snapping;
              snapping.time += elapsed;
              if (snapping.time >= this.options.time) {
                  this.parent.scale.set(this.xScale, this.yScale);
                  if (this.options.removeOnComplete) {
                      this.parent.plugins.remove('snap-zoom');
                  }
                  this.parent.emit('snap-zoom-end', this.parent);
                  this.snapping = null;
              }
              else {
                  const snapping = this.snapping;
                  const worldScreenWidth = this.ease(snapping.time, snapping.startX, snapping.deltaX, this.options.time);
                  const worldScreenHeight = this.ease(snapping.time, snapping.startY, snapping.deltaY, this.options.time);

                  this.parent.scale.x = this.parent.screenWidth / worldScreenWidth;
                  this.parent.scale.y = this.parent.screenHeight / worldScreenHeight;
              }
              const clamp = this.parent.plugins.get('clamp-zoom', true);
              if (clamp) {
                  clamp.clamp();
              }
              if (!this.options.noMove) {
                  if (!this.options.center) {
                      this.parent.moveCenter(oldCenter);
                  }
                  else {
                      this.parent.moveCenter(this.options.center);
                  }
              }
          }
      }

      resume() {
          this.snapping = null;
          super.resume();
      }
  }

  /**
   * @typedef {object} FollowOptions
   * @property {number} [speed=0] to follow in pixels/frame (0=teleport to location)
   * @property {number} [acceleration] set acceleration to accelerate and decelerate at this rate; speed cannot be 0 to use acceleration
   * @property {number} [radius] radius (in world coordinates) of center circle where movement is allowed without moving the viewport
   */

  const followOptions = {
      speed: 0,
      acceleration: null,
      radius: null
  };

  class Follow extends Plugin
  {
      /**
       * @private
       * @param {Viewport} parent
       * @param {PIXI.DisplayObject} target to follow
       * @param {FollowOptions} [options]
       */
      constructor(parent, target, options = {})
      {
          super(parent);
          this.target = target;
          this.options = Object.assign({}, followOptions, options);
          this.velocity = { x: 0, y: 0 };
      }

      update(elapsed)
      {
          if (this.paused)
          {
              return
          }

          const center = this.parent.center;
          let toX = this.target.x,
              toY = this.target.y;
          if (this.options.radius)
          {
              const distance = Math.sqrt(Math.pow(this.target.y - center.y, 2) + Math.pow(this.target.x - center.x, 2));
              if (distance > this.options.radius)
              {
                  const angle = Math.atan2(this.target.y - center.y, this.target.x - center.x);
                  toX = this.target.x - Math.cos(angle) * this.options.radius;
                  toY = this.target.y - Math.sin(angle) * this.options.radius;
              }
              else
              {
                  return
              }
          }

          const deltaX = toX - center.x;
          const deltaY = toY - center.y;
          if (deltaX || deltaY)
          {
              if (this.options.speed)
              {
                  if (this.options.acceleration)
                  {
                      const angle = Math.atan2(toY - center.y, toX - center.x);
                      const distance = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));
                      if (distance)
                      {
                          const decelerationDistance = (Math.pow(this.velocity.x, 2) + Math.pow(this.velocity.y, 2)) / (2 * this.options.acceleration);
                          if (distance > decelerationDistance)
                          {
                              this.velocity = {
                                  x: Math.min(this.velocity.x + this.options.acceleration * elapsed, this.options.speed),
                                  y: Math.min(this.velocity.y + this.options.acceleration * elapsed, this.options.speed)
                              };
                          }
                          else
                          {
                              this.velocity = {
                                  x: Math.max(this.velocity.x - this.options.acceleration * this.options.speed, 0),
                                  y: Math.max(this.velocity.y - this.options.acceleration * this.options.speed, 0)
                              };
                          }
                          const changeX = Math.cos(angle) * this.velocity.x;
                          const changeY = Math.sin(angle) * this.velocity.y;
                          const x = Math.abs(changeX) > Math.abs(deltaX) ? toX : center.x + changeX;
                          const y = Math.abs(changeY) > Math.abs(deltaY) ? toY : center.y + changeY;
                          this.parent.moveCenter(x, y);
                          this.parent.emit('moved', { viewport: this.parent, type: 'follow' });
                      }
                  }
                  else
                  {
                      const angle = Math.atan2(toY - center.y, toX - center.x);
                      const changeX = Math.cos(angle) * this.options.speed;
                      const changeY = Math.sin(angle) * this.options.speed;
                      const x = Math.abs(changeX) > Math.abs(deltaX) ? toX : center.x + changeX;
                      const y = Math.abs(changeY) > Math.abs(deltaY) ? toY : center.y + changeY;
                      this.parent.moveCenter(x, y);
                      this.parent.emit('moved', { viewport: this.parent, type: 'follow' });
                  }
              }
              else
              {
                  this.parent.moveCenter(toX, toY);
                  this.parent.emit('moved', { viewport: this.parent, type: 'follow' });
              }
          }
      }
  }

  /**
   * the default event listener for 'wheel' event is document.body. Use `Viewport.options.divWheel` to change this default
   * @typedef WheelOptions
   * @property {number} [percent=0.1] percent to scroll with each spin
   * @property {number} [smooth] smooth the zooming by providing the number of frames to zoom between wheel spins
   * @property {boolean} [interrupt=true] stop smoothing with any user input on the viewport
   * @property {boolean} [reverse] reverse the direction of the scroll
   * @property {PIXI.Point} [center] place this point at center during zoom instead of current mouse position
   * @property {number} [lineHeight=20] scaling factor for non-DOM_DELTA_PIXEL scrolling events
   * @property {('all'|'x'|'y')} [axis=all] axis to zoom
   */

  const wheelOptions = {
      percent: 0.1,
      smooth: false,
      interrupt: true,
      reverse: false,
      center: null,
      lineHeight: 20,
      axis: 'all',
  };

  class Wheel extends Plugin {
      /**
       * @private
       * @param {Viewport} parent
       * @param {WheelOptions} [options]
       * @event wheel({wheel: {dx, dy, dz}, event, viewport})
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, wheelOptions, options);
      }

      down() {
          if (this.options.interrupt) {
              this.smoothing = null;
          }
      }

      isAxisX() {
          return ['all', 'x'].includes(this.options.axis)
      }

      isAxisY() {
          return ['all', 'y'].includes(this.options.axis)
      }

      update() {
          if (this.smoothing) {
              const point = this.smoothingCenter;
              const change = this.smoothing;
              let oldPoint;
              if (!this.options.center) {
                  oldPoint = this.parent.toLocal(point);
              }
              if (this.isAxisX()) {
                  this.parent.scale.x += change.x;
              }
              if (this.isAxisY()) {
                  this.parent.scale.y += change.y;
              }
              this.parent.emit('zoomed', { viewport: this.parent, type: 'wheel' });
              const clamp = this.parent.plugins.get('clamp-zoom', true);
              if (clamp) {
                  clamp.clamp();
              }
              if (this.options.center) {
                  this.parent.moveCenter(this.options.center);
              } else {
                  const newPoint = this.parent.toGlobal(oldPoint);
                  this.parent.x += point.x - newPoint.x;
                  this.parent.y += point.y - newPoint.y;
              }
              this.parent.emit('moved', { viewport: this.parent, type: 'wheel' });
              this.smoothingCount++;
              if (this.smoothingCount >= this.options.smooth) {
                  this.smoothing = null;
              }
          }
      }

      wheel(e) {
          if (this.paused) {
              return
          }
          let point = this.parent.input.getPointerPosition(e);
          const sign = this.options.reverse ? -1 : 1;
          const step = sign * -e.deltaY * (e.deltaMode ? this.options.lineHeight : 1) / 500;
          const change = Math.pow(2, (1 + this.options.percent) * step);
          if (this.options.smooth) {
              const original = {
                  x: this.smoothing ? this.smoothing.x * (this.options.smooth - this.smoothingCount) : 0,
                  y: this.smoothing ? this.smoothing.y * (this.options.smooth - this.smoothingCount) : 0
              };
              this.smoothing = {
                  x: ((this.parent.scale.x + original.x) * change - this.parent.scale.x) / this.options.smooth,
                  y: ((this.parent.scale.y + original.y) * change - this.parent.scale.y) / this.options.smooth
              };
              this.smoothingCount = 0;
              this.smoothingCenter = point;
          } else {
              let oldPoint;
              if (!this.options.center) {
                  oldPoint = this.parent.toLocal(point);
              }
              if (this.isAxisX()) {
                  this.parent.scale.x *= change;
              }
              if (this.isAxisY()) {
                  this.parent.scale.y *= change;
              }
              this.parent.emit('zoomed', { viewport: this.parent, type: 'wheel' });
              const clamp = this.parent.plugins.get('clamp-zoom', true);
              if (clamp) {
                  clamp.clamp();
              }
              if (this.options.center) {
                  this.parent.moveCenter(this.options.center);
              } else {
                  const newPoint = this.parent.toGlobal(oldPoint);
                  this.parent.x += point.x - newPoint.x;
                  this.parent.y += point.y - newPoint.y;
              }
          }
          this.parent.emit('moved', { viewport: this.parent, type: 'wheel' });
          this.parent.emit('wheel', { wheel: { dx: e.deltaX, dy: e.deltaY, dz: e.deltaZ }, event: e, viewport: this.parent });
          if (!this.parent.options.passiveWheel) {
              return true
          }
      }
  }

  /**
   * @typedef MouseEdgesOptions
   * @property {number} [radius] distance from center of screen in screen pixels
   * @property {number} [distance] distance from all sides in screen pixels
   * @property {number} [top] alternatively, set top distance (leave unset for no top scroll)
   * @property {number} [bottom] alternatively, set bottom distance (leave unset for no top scroll)
   * @property {number} [left] alternatively, set left distance (leave unset for no top scroll)
   * @property {number} [right] alternatively, set right distance (leave unset for no top scroll)
   * @property {number} [speed=8] speed in pixels/frame to scroll viewport
   * @property {boolean} [reverse] reverse direction of scroll
   * @property {boolean} [noDecelerate] don't use decelerate plugin even if it's installed
   * @property {boolean} [linear] if using radius, use linear movement (+/- 1, +/- 1) instead of angled movement (Math.cos(angle from center), Math.sin(angle from center))
   * @property {boolean} [allowButtons] allows plugin to continue working even when there's a mousedown event
   */

  const mouseEdgesOptions = {
      radius: null,
      distance: null,
      top: null,
      bottom: null,
      left: null,
      right: null,
      speed: 8,
      reverse: false,
      noDecelerate: false,
      linear: false,
      allowButtons: false
  };

  class MouseEdges extends Plugin {
      /**
       * Scroll viewport when mouse hovers near one of the edges.
       * @private
       * @param {Viewport} parent
       * @param {MouseEdgeOptions} [options]
       * @event mouse-edge-start(Viewport) emitted when mouse-edge starts
       * @event mouse-edge-end(Viewport) emitted when mouse-edge ends
       */
      constructor(parent, options = {}) {
          super(parent);
          this.options = Object.assign({}, mouseEdgesOptions, options);
          this.reverse = this.options.reverse ? 1 : -1;
          this.radiusSquared = Math.pow(this.options.radius, 2);
          this.resize();
      }

      resize() {
          const distance = this.options.distance;
          if (distance !== null) {
              this.left = distance;
              this.top = distance;
              this.right = this.parent.worldScreenWidth - distance;
              this.bottom = this.parent.worldScreenHeight - distance;
          }
          else if (!this.radius) {
              this.left = this.options.left;
              this.top = this.options.top;
              this.right = this.options.right === null ? null : this.parent.worldScreenWidth - this.options.right;
              this.bottom = this.options.bottom === null ? null : this.parent.worldScreenHeight - this.options.bottom;
          }
      }

      down() {
          if (this.paused) {
              return
          }
          if (!this.options.allowButtons) {
              this.horizontal = this.vertical = null;
          }
      }

      move(event) {
          if (this.paused) {
              return
          }
          if ((event.data.pointerType !== 'mouse' && event.data.identifier !== 1) || (!this.options.allowButtons && event.data.buttons !== 0)) {
              return
          }
          const x = event.data.global.x;
          const y = event.data.global.y;

          if (this.radiusSquared) {
              const center = this.parent.toScreen(this.parent.center);
              const distance = Math.pow(center.x - x, 2) + Math.pow(center.y - y, 2);
              if (distance >= this.radiusSquared) {
                  const angle = Math.atan2(center.y - y, center.x - x);
                  if (this.options.linear) {
                      this.horizontal = Math.round(Math.cos(angle)) * this.options.speed * this.reverse * (60 / 1000);
                      this.vertical = Math.round(Math.sin(angle)) * this.options.speed * this.reverse * (60 / 1000);
                  }
                  else {
                      this.horizontal = Math.cos(angle) * this.options.speed * this.reverse * (60 / 1000);
                      this.vertical = Math.sin(angle) * this.options.speed * this.reverse * (60 / 1000);
                  }
              }
              else {
                  if (this.horizontal) {
                      this.decelerateHorizontal();
                  }
                  if (this.vertical) {
                      this.decelerateVertical();
                  }
                  this.horizontal = this.vertical = 0;
              }
          }
          else {
              if (this.left !== null && x < this.left) {
                  this.horizontal = 1 * this.reverse * this.options.speed * (60 / 1000);
              }
              else if (this.right !== null && x > this.right) {
                  this.horizontal = -1 * this.reverse * this.options.speed * (60 / 1000);
              }
              else {
                  this.decelerateHorizontal();
                  this.horizontal = 0;
              }
              if (this.top !== null && y < this.top) {
                  this.vertical = 1 * this.reverse * this.options.speed * (60 / 1000);
              }
              else if (this.bottom !== null && y > this.bottom) {
                  this.vertical = -1 * this.reverse * this.options.speed * (60 / 1000);
              }
              else {
                  this.decelerateVertical();
                  this.vertical = 0;
              }
          }
      }

      decelerateHorizontal() {
          const decelerate = this.parent.plugins.get('decelerate', true);
          if (this.horizontal && decelerate && !this.options.noDecelerate) {
              decelerate.activate({ x: (this.horizontal * this.options.speed * this.reverse) / (1000 / 60) });
          }
      }

      decelerateVertical() {
          const decelerate = this.parent.plugins.get('decelerate', true);
          if (this.vertical && decelerate && !this.options.noDecelerate) {
              decelerate.activate({ y: (this.vertical * this.options.speed * this.reverse) / (1000 / 60) });
          }
      }

      up() {
          if (this.paused) {
              return
          }
          if (this.horizontal) {
              this.decelerateHorizontal();
          }
          if (this.vertical) {
              this.decelerateVertical();
          }
          this.horizontal = this.vertical = null;
      }

      update() {
          if (this.paused) {
              return
          }

          if (this.horizontal || this.vertical) {
              const center = this.parent.center;
              if (this.horizontal) {
                  center.x += this.horizontal * this.options.speed;
              }
              if (this.vertical) {
                  center.y += this.vertical * this.options.speed;
              }
              this.parent.moveCenter(center);
              this.parent.emit('moved', { viewport: this.parent, type: 'mouse-edges' });
          }
      }
  }

  /**
   * To set the zoom level, use: (1) scale, (2) scaleX and scaleY, or (3) width and/or height
   * @typedef {options} AnimateOptions
   * @property {number} [time=1000] to animate
   * @property {PIXI.Point} [position=viewport.center] position to move viewport
   * @property {number} [width] desired viewport width in world pixels (use instead of scale; aspect ratio is maintained if height is not provided)
   * @property {number} [height] desired viewport height in world pixels (use instead of scale; aspect ratio is maintained if width is not provided)
   * @property {number} [scale] scale to change zoom (scale.x = scale.y)
   * @property {number} [scaleX] independently change zoom in x-direction
   * @property {number} [scaleY] independently change zoom in y-direction
   * @property {(function|string)} [ease=linear] easing function to use
   * @property {function} [callbackOnComplete]
   * @property {boolean} [removeOnInterrupt] removes this plugin if interrupted by any user input
   */

  const animateOptions = {
      removeOnInterrupt: false,
      ease: 'linear',
      time: 1000
  };

  class Animate extends Plugin
  {
      /**
       * @private
       * @param {Viewport} parent
       * @param {AnimateOptions} [options]
       * @fires animate-end
       */
      constructor(parent, options={})
      {
          super(parent);
          this.options = Object.assign({}, animateOptions, options);
          this.options.ease = ease(this.options.ease);
          this.setupPosition();
          this.setupZoom();
      }

      setupPosition()
      {
          if (typeof this.options.position !== 'undefined')
          {
              this.startX = this.parent.center.x;
              this.startY = this.parent.center.y;
              this.deltaX = this.options.position.x - this.parent.center.x;
              this.deltaY = this.options.position.y - this.parent.center.y;
              this.keepCenter = false;
          }
          else
          {
              this.keepCenter = true;
          }
      }

      setupZoom()
      {
          this.width = null;
          this.height = null;
          if (typeof this.options.scale !== 'undefined')
          {
              this.width = this.parent.screenWidth / this.options.scale;
          }
          else if (typeof this.options.scaleX !== 'undefined' || typeof this.options.scaleY !== 'undefined')
          {
              if (typeof this.options.scaleX !== 'undefined')
              {
                  // screenSizeInWorldPixels = screenWidth / scale
                  this.width = this.parent.screenWidth / this.options.scaleX;
              }
              if (typeof this.options.scaleY !== 'undefined')
              {
                  this.height = this.parent.screenHeight / this.options.scaleY;
              }
          }
          else
          {
              if (typeof this.options.width !== 'undefined')
              {
                  this.width = this.options.width;
              }
              if (typeof this.options.height !== 'undefined')
              {
                  this.height = this.options.height;
              }
          }
          if (typeof this.width !== null)
          {
              this.startWidth = this.parent.screenWidthInWorldPixels;
              this.deltaWidth = this.width - this.startWidth;
          }
          if (typeof this.height !== null)
          {
              this.startHeight = this.parent.screenHeightInWorldPixels;
              this.deltaHeight = this.height - this.startHeight;
          }
          this.time = 0;
      }

      down()
      {
          if (this.options.removeOnInterrupt)
          {
              this.parent.plugins.remove('animate');
          }
      }

      complete()
      {
          this.parent.plugins.remove('animate');
          if (this.width !== null)
          {
              this.parent.fitWidth(this.width, this.keepCenter, this.height === null);
          }
          if (this.height !== null)
          {
              this.parent.fitHeight(this.height, this.keepCenter, this.width === null);
          }
          if (!this.keepCenter)
          {
              this.parent.moveCenter(this.options.position.x, this.options.position.y);
          }
          this.parent.emit('animate-end', this.parent);
          if (this.options.callbackOnComplete)
          {
              this.options.callbackOnComplete(this.parent);
          }
      }

      update(elapsed)
      {
          if (this.paused)
          {
              return
          }
          this.time += elapsed;
          if (this.time >= this.options.time)
          {
              this.complete();
          }
          else
          {
              const originalZoom = new PIXI.Point(this.parent.scale.x, this.parent.scale.y);
              const percent = this.options.ease(this.time, 0, 1, this.options.time);
              if (this.width !== null)
              {
                  this.parent.fitWidth(this.startWidth + this.deltaWidth * percent, this.keepCenter, this.height === null);
              }
              if (this.height !== null)
              {
                  this.parent.fitHeight(this.startHeight + this.deltaHeight * percent, this.keepCenter, this.width === null);
              }
              if (this.width === null)
              {
                  this.parent.scale.x = this.parent.scale.y;
              }
              else if (this.height === null)
              {
                  this.parent.scale.y = this.parent.scale.x;
              }
              if (!this.keepCenter)
              {
                  const original = new PIXI.Point(this.parent.x, this.parent.y);
                  this.parent.moveCenter(this.startX + this.deltaX * percent, this.startY + this.deltaY * percent);
                  this.parent.emit('moved', { viewport: this.parent, original, type: 'animate'});
              }
              if (this.width || this.height)
              {
                  this.parent.emit('zoomed', { viewport: this.parent, original: originalZoom, type: 'animate' });
              }
              if (!this.keepCenter)
              ;
          }
      }
  }

  /**
   * @typedef {object} ViewportOptions
   * @property {number} [screenWidth=window.innerWidth]
   * @property {number} [screenHeight=window.innerHeight]
   * @property {number} [worldWidth=this.width]
   * @property {number} [worldHeight=this.height]
   * @property {number} [threshold=5] number of pixels to move to trigger an input event (e.g., drag, pinch) or disable a clicked event
   * @property {boolean} [passiveWheel=true] whether the 'wheel' event is set to passive (note: if false, e.preventDefault() will be called when wheel is used over the viewport)
   * @property {boolean} [stopPropagation=false] whether to stopPropagation of events that impact the viewport (except wheel events, see options.passiveWheel)
   * @property {HitArea} [forceHitArea] change the default hitArea from world size to a new value
   * @property {boolean} [noTicker] set this if you want to manually call update() function on each frame
   * @property {PIXI.Ticker} [ticker=PIXI.Ticker.shared] use this PIXI.ticker for updates
   * @property {PIXI.InteractionManager} [interaction=null] InteractionManager, available from instantiated WebGLRenderer/CanvasRenderer.plugins.interaction - used to calculate pointer postion relative to canvas location on screen
   * @property {HTMLElement} [divWheel=document.body] div to attach the wheel event
   * @property {boolean} [disableOnContextMenu] remove oncontextmenu=() => {} from the divWheel element
   */

  const viewportOptions = {
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: null,
      worldHeight: null,
      threshold: 5,
      passiveWheel: true,
      stopPropagation: false,
      forceHitArea: null,
      noTicker: false,
      interaction: null,
      disableOnContextMenu: false
  };

  /**
   * Main class to use when creating a Viewport
   */
  class Viewport extends PIXI.Container {
      /**
       * @param {ViewportOptions} [options]
       * @fires clicked
       * @fires drag-start
       * @fires drag-end
       * @fires drag-remove
       * @fires pinch-start
       * @fires pinch-end
       * @fires pinch-remove
       * @fires snap-start
       * @fires snap-end
       * @fires snap-remove
       * @fires snap-zoom-start
       * @fires snap-zoom-end
       * @fires snap-zoom-remove
       * @fires bounce-x-start
       * @fires bounce-x-end
       * @fires bounce-y-start
       * @fires bounce-y-end
       * @fires bounce-remove
       * @fires wheel
       * @fires wheel-remove
       * @fires wheel-scroll
       * @fires wheel-scroll-remove
       * @fires mouse-edge-start
       * @fires mouse-edge-end
       * @fires mouse-edge-remove
       * @fires moved
       * @fires moved-end
       * @fires zoomed
       * @fires zoomed-end
       * @fires frame-end
       */
      constructor(options = {}) {
          super();
          this.options = Object.assign({}, viewportOptions, options);

          // needed to pull this out of viewportOptions because of pixi.js v4 support (which changed from PIXI.ticker.shared to PIXI.Ticker.shared...sigh)
          if (options.ticker) {
              this.options.ticker = options.ticker;
          }
          else {
              // to avoid Rollup transforming our import, save pixi namespace in a variable
              // from here: https://github.com/pixijs/pixi.js/issues/5757
              let ticker;
              const pixiNS = PIXI__namespace;
              if (parseInt(/^(\d+)\./.exec(PIXI.VERSION)[1]) < 5) {
                  ticker = pixiNS.ticker.shared;
              }
              else {
                  ticker = pixiNS.Ticker.shared;
              }
              this.options.ticker = options.ticker || ticker;
          }

          /** @type {number} */
          this.screenWidth = this.options.screenWidth;

          /** @type {number} */
          this.screenHeight = this.options.screenHeight;

          this._worldWidth = this.options.worldWidth;
          this._worldHeight = this.options.worldHeight;
          this.forceHitArea = this.options.forceHitArea;

          /**
           * number of pixels to move to trigger an input event (e.g., drag, pinch) or disable a clicked event
           * @type {number}
           */
          this.threshold = this.options.threshold;

          this.options.divWheel = this.options.divWheel || document.body;

          if (this.options.disableOnContextMenu) {
              this.options.divWheel.oncontextmenu = e => e.preventDefault();
          }

          if (!this.options.noTicker) {
              this.tickerFunction = () => this.update(this.options.ticker.elapsedMS);
              this.options.ticker.add(this.tickerFunction);
          }

          this.input = new InputManager(this);

          /**
           * Use this to add user plugins or access existing plugins (e.g., to pause, resume, or remove them)
           * @type {PluginManager}
           */
          this.plugins = new PluginManager(this);
      }

      /**
       * overrides PIXI.Container's destroy to also remove the 'wheel' and PIXI.Ticker listeners
       * @param {(object|boolean)} [options] - Options parameter. A boolean will act as if all options have been set to that value
       * @param {boolean} [options.children=false] - if set to true, all the children will have their destroy method called as well. 'options' will be passed on to those calls.
       * @param {boolean} [options.texture=false] - Only used for child Sprites if options.children is set to true. Should it destroy the texture of the child sprite
       * @param {boolean} [options.baseTexture=false] - Only used for child Sprites if options.children is set to true. Should it destroy the base texture of the child sprite     */
      destroy(options) {
          if (!this.options.noTicker) {
              this.options.ticker.remove(this.tickerFunction);
          }
          this.input.destroy();
          super.destroy(options);
      }

      /**
       * update viewport on each frame
       * by default, you do not need to call this unless you set options.noTicker=true
       * @param {number} elapsed time in milliseconds since last update
       */
      update(elapsed) {
          if (!this.pause) {
              this.plugins.update(elapsed);

              if (this.lastViewport) {
                  // check for moved-end event
                  if (this.lastViewport.x !== this.x || this.lastViewport.y !== this.y) {
                      this.moving = true;
                  }
                  else {
                      if (this.moving) {
                          this.emit('moved-end', this);
                          this.moving = false;
                      }
                  }
                  // check for zoomed-end event
                  if (this.lastViewport.scaleX !== this.scale.x || this.lastViewport.scaleY !== this.scale.y) {
                      this.zooming = true;
                  }
                  else {
                      if (this.zooming) {
                          this.emit('zoomed-end', this);
                          this.zooming = false;
                      }
                  }
              }

              if (!this.forceHitArea) {
                  this._hitAreaDefault = new PIXI.Rectangle(this.left, this.top, this.worldScreenWidth, this.worldScreenHeight);
                  this.hitArea = this._hitAreaDefault;
              }

              this._dirty = this._dirty || !this.lastViewport ||
                  this.lastViewport.x !== this.x || this.lastViewport.y !== this.y ||
                  this.lastViewport.scaleX !== this.scale.x || this.lastViewport.scaleY !== this.scale.y;

              this.lastViewport = {
                  x: this.x,
                  y: this.y,
                  scaleX: this.scale.x,
                  scaleY: this.scale.y
              };
              this.emit('frame-end', this);
          }
      }

      /**
       * use this to set screen and world sizes--needed for pinch/wheel/clamp/bounce
       * @param {number} [screenWidth=window.innerWidth]
       * @param {number} [screenHeight=window.innerHeight]
       * @param {number} [worldWidth]
       * @param {number} [worldHeight]
       */
      resize(screenWidth = window.innerWidth, screenHeight = window.innerHeight, worldWidth, worldHeight) {
          this.screenWidth = screenWidth;
          this.screenHeight = screenHeight;
          if (typeof worldWidth !== 'undefined') {
              this._worldWidth = worldWidth;
          }
          if (typeof worldHeight !== 'undefined') {
              this._worldHeight = worldHeight;
          }
          this.plugins.resize();
          this.dirty = true;
      }

      /**
       * world width in pixels
       * @type {number}
       */
      get worldWidth() {
          if (this._worldWidth) {
              return this._worldWidth
          }
          else {
              return this.width / this.scale.x
          }
      }
      set worldWidth(value) {
          this._worldWidth = value;
          this.plugins.resize();
      }

      /**
       * world height in pixels
       * @type {number}
       */
      get worldHeight() {
          if (this._worldHeight) {
              return this._worldHeight
          }
          else {
              return this.height / this.scale.y
          }
      }
      set worldHeight(value) {
          this._worldHeight = value;
          this.plugins.resize();
      }

      /**
       * get visible bounds of viewport
       * @returns {PIXI.Rectangle}
       */
      getVisibleBounds() {
          return new PIXI.Rectangle(this.left, this.top, this.worldScreenWidth, this.worldScreenHeight)
      }

      /**
       * change coordinates from screen to world
       * @param {(number|PIXI.Point)} x or point
       * @param {number} [y]
       * @return {PIXI.Point}
       */
      toWorld(x, y) {
          if (arguments.length === 2) {
              return this.toLocal(new PIXI.Point(x, y))
          }
          else {
              return this.toLocal(x)
          }
      }

      /**
       * change coordinates from world to screen
       * @param {(number|PIXI.Point)} x or point
       * @param {number} [y]
       * @return {PIXI.Point}
       */
      toScreen(x, y) {
          if (arguments.length === 2) {
              return this.toGlobal(new PIXI.Point(x, y))
          }
          else {
              return this.toGlobal(x)
          }
      }

      /**
       * screen width in world coordinates
       * @type {number}
       */
      get worldScreenWidth() {
          return this.screenWidth / this.scale.x
      }

      /**
       * screen height in world coordinates
       * @type {number}
       */
      get worldScreenHeight() {
          return this.screenHeight / this.scale.y
      }

      /**
       * world width in screen coordinates
       * @type {number}
       */
      get screenWorldWidth() {
          return this.worldWidth * this.scale.x
      }

      /**
       * world height in screen coordinates
       * @type {number}
       */
      get screenWorldHeight() {
          return this.worldHeight * this.scale.y
      }

      /**
       * center of screen in world coordinates
       * @type {PIXI.Point}
       */
      get center() {
          return new PIXI.Point(this.worldScreenWidth / 2 - this.x / this.scale.x, this.worldScreenHeight / 2 - this.y / this.scale.y)
      }
      set center(value) {
          this.moveCenter(value);
      }

      /**
       * move center of viewport to point
       * @param {(number|PIXI.Point)} x or point
       * @param {number} [y]
       * @return {Viewport} this
       */
      moveCenter() {
          let x, y;
          if (!isNaN(arguments[0])) {
              x = arguments[0];
              y = arguments[1];
          }
          else {
              x = arguments[0].x;
              y = arguments[0].y;
          }
          const newX = (this.worldScreenWidth / 2 - x) * this.scale.x;
          const newY = (this.worldScreenHeight / 2 - y) * this.scale.y;
          if (this.x !== newX || this.y !== newY) {
              this.position.set(newX, newY);
              this.plugins.reset();
              this.dirty = true;
          }
          return this
      }

      /**
       * top-left corner of Viewport
       * @type {PIXI.Point}
       */
      get corner() {
          return new PIXI.Point(-this.x / this.scale.x, -this.y / this.scale.y)
      }
      set corner(value) {
          this.moveCorner(value);
      }

      /**
       * move viewport's top-left corner; also clamps and resets decelerate and bounce (as needed)
       * @param {(number|PIXI.Point)} x or point
       * @param {number} [y]
       * @return {Viewport} this
       */
      moveCorner() {
          let x, y;
          if (arguments.length === 1) {
              x = -arguments[0].x * this.scale.x;
              y = -arguments[0].y * this.scale.y;
          } else {
              x = -arguments[0] * this.scale.x;
              y = -arguments[1] * this.scale.y;
          }
          if (x !== this.x || y !== this.y) {
              this.position.set(x, y);
              this.plugins.reset();
              this.dirty = true;
          }
          return this
      }

      /**
       * get how many world pixels fit in screen's width
       * @type {number}
       */
      get screenWidthInWorldPixels() {
          return this.screenWidth / this.scale.x
      }

      /**
       * get how many world pixels fit on screen's height
       * @type {number}
       */
      get screenHeightInWorldPixels() {
          return this.screenHeight / this.scale.y
      }

      /**
       * find the scale value that fits a world width on the screen
       * does not change the viewport (use fit... to change)
       * @param {number} width in world pixels
       * @returns {number} scale
       */
      findFitWidth(width) {
          return this.screenWidth / width
      }

      /**
       * finds the scale value that fits a world height on the screens
       * does not change the viewport (use fit... to change)
       * @param {number} height in world pixels
       * @returns {number} scale
       */
      findFitHeight(height) {
          return this.screenHeight / height
      }

      /**
       * finds the scale value that fits the smaller of a world width and world height on the screen
       * does not change the viewport (use fit... to change)
       * @param {number} width in world pixels
       * @param {number} height in world pixels
       * @returns {number} scale
       */
      findFit(width, height) {
          const scaleX = this.screenWidth / width;
          const scaleY = this.screenHeight / height;
          return Math.min(scaleX, scaleY)
      }

      /**
       * finds the scale value that fits the larger of a world width and world height on the screen
       * does not change the viewport (use fit... to change)
       * @param {number} width in world pixels
       * @param {number} height in world pixels
       * @returns {number} scale
       */
      findCover(width, height) {
          const scaleX = this.screenWidth / width;
          const scaleY = this.screenHeight / height;
          return Math.max(scaleX, scaleY)
      }

      /**
       * change zoom so the width fits in the viewport
       * @param {number} [width=this.worldWidth] in world coordinates
       * @param {boolean} [center] maintain the same center
       * @param {boolean} [scaleY=true] whether to set scaleY=scaleX
       * @param {boolean} [noClamp] whether to disable clamp-zoom
       * @returns {Viewport} this
       */
      fitWidth(width, center, scaleY = true, noClamp) {
          let save;
          if (center) {
              save = this.center;
          }
          this.scale.x = this.screenWidth / width;

          if (scaleY) {
              this.scale.y = this.scale.x;
          }

          const clampZoom = this.plugins.get('clamp-zoom', true);
          if (!noClamp && clampZoom) {
              clampZoom.clamp();
          }

          if (center) {
              this.moveCenter(save);
          }
          return this
      }

      /**
       * change zoom so the height fits in the viewport
       * @param {number} [height=this.worldHeight] in world coordinates
       * @param {boolean} [center] maintain the same center of the screen after zoom
       * @param {boolean} [scaleX=true] whether to set scaleX = scaleY
       * @param {boolean} [noClamp] whether to disable clamp-zoom
       * @returns {Viewport} this
       */
      fitHeight(height, center, scaleX = true, noClamp) {
          let save;
          if (center) {
              save = this.center;
          }
          this.scale.y = this.screenHeight / height;

          if (scaleX) {
              this.scale.x = this.scale.y;
          }

          const clampZoom = this.plugins.get('clamp-zoom', true);
          if (!noClamp && clampZoom) {
              clampZoom.clamp();
          }

          if (center) {
              this.moveCenter(save);
          }
          return this
      }

      /**
       * change zoom so it fits the entire world in the viewport
       * @param {boolean} center maintain the same center of the screen after zoom
       * @returns {Viewport} this
       */
      fitWorld(center) {
          let save;
          if (center) {
              save = this.center;
          }
          this.scale.x = this.screenWidth / this.worldWidth;
          this.scale.y = this.screenHeight / this.worldHeight;
          if (this.scale.x < this.scale.y) {
              this.scale.y = this.scale.x;
          }
          else {
              this.scale.x = this.scale.y;
          }

          const clampZoom = this.plugins.get('clamp-zoom', true);
          if (clampZoom) {
              clampZoom.clamp();
          }

          if (center) {
              this.moveCenter(save);
          }
          return this
      }

      /**
       * change zoom so it fits the size or the entire world in the viewport
       * @param {boolean} [center] maintain the same center of the screen after zoom
       * @param {number} [width=this.worldWidth] desired width
       * @param {number} [height=this.worldHeight] desired height
       * @returns {Viewport} this
       */
      fit(center, width = this.worldWidth, height = this.worldHeight) {
          let save;
          if (center) {
              save = this.center;
          }
          this.scale.x = this.screenWidth / width;
          this.scale.y = this.screenHeight / height;
          if (this.scale.x < this.scale.y) {
              this.scale.y = this.scale.x;
          }
          else {
              this.scale.x = this.scale.y;
          }
          const clampZoom = this.plugins.get('clamp-zoom', true);
          if (clampZoom) {
              clampZoom.clamp();
          }
          if (center) {
              this.moveCenter(save);
          }
          return this
      }

      set visible(value) {
          if (!value) {
              this.input.clear();
          }
          super.visible = value;
      }

      /**
       * zoom viewport to specific value
       * @param {number} scale value (e.g., 1 would be 100%, 0.25 would be 25%)
       * @param {boolean} [center] maintain the same center of the screen after zoom
       * @return {Viewport} this
       */
      setZoom(scale, center) {
          let save;
          if (center) {
              save = this.center;
          }
          this.scale.set(scale);
          const clampZoom = this.plugins.get('clamp-zoom', true);
          if (clampZoom) {
              clampZoom.clamp();
          }
          if (center) {
              this.moveCenter(save);
          }
          return this
      }

      /**
       * zoom viewport by a certain percent (in both x and y direction)
       * @param {number} percent change (e.g., 0.25 would increase a starting scale of 1.0 to 1.25)
       * @param {boolean} [center] maintain the same center of the screen after zoom
       * @return {Viewport} this
       */
      zoomPercent(percent, center) {
          return this.setZoom(this.scale.x + this.scale.x * percent, center)
      }

      /**
       * zoom viewport by increasing/decreasing width by a certain number of pixels
       * @param {number} change in pixels
       * @param {boolean} [center] maintain the same center of the screen after zoom
       * @return {Viewport} this
       */
      zoom(change, center) {
          this.fitWidth(change + this.worldScreenWidth, center);
          return this
      }

      /**
       * changes scale of viewport and maintains center of viewport
       * @type {number}
       */
      set scaled(scale) {
          this.setZoom(scale, true);
      }
      get scaled() {
          return this.scale.x
      }

      /**
       * @param {SnapZoomOptions} options
       */
      snapZoom(options) {
          this.plugins.add('snap-zoom', new SnapZoom(this, options));
          return this
      }

      /**
       * is container out of world bounds
       * @returns {OutOfBounds}
       */
      OOB() {
          return {
              left: this.left < 0,
              right: this.right > this.worldWidth,
              top: this.top < 0,
              bottom: this.bottom > this._worldHeight,
              cornerPoint: new PIXI.Point(
                  this.worldWidth * this.scale.x - this.screenWidth,
                  this.worldHeight * this.scale.y - this.screenHeight
              )
          }
      }

      /**
       * world coordinates of the right edge of the screen
       * @type {number}
       */
      get right() {
          return -this.x / this.scale.x + this.worldScreenWidth
      }
      set right(value) {
          this.x = -value * this.scale.x + this.screenWidth;
          this.plugins.reset();
      }

      /**
       * world coordinates of the left edge of the screen
       * @type { number }
       */
      get left() {
          return -this.x / this.scale.x
      }
      set left(value) {
          this.x = -value * this.scale.x;
          this.plugins.reset();
      }

      /**
       * world coordinates of the top edge of the screen
       * @type {number}
       */
      get top() {
          return -this.y / this.scale.y
      }
      set top(value) {
          this.y = -value * this.scale.y;
          this.plugins.reset();
      }

      /**
       * world coordinates of the bottom edge of the screen
       * @type {number}
       */
      get bottom() {
          return -this.y / this.scale.y + this.worldScreenHeight
      }
      set bottom(value) {
          this.y = -value * this.scale.y + this.screenHeight;
          this.plugins.reset();
      }

      /**
       * determines whether the viewport is dirty (i.e., needs to be renderered to the screen because of a change)
       * @type {boolean}
       */
      get dirty() {
          return this._dirty
      }
      set dirty(value) {
          this._dirty = value;
      }

      /**
       * permanently changes the Viewport's hitArea
       * NOTE: if not set then hitArea = PIXI.Rectangle(Viewport.left, Viewport.top, Viewport.worldScreenWidth, Viewport.worldScreenHeight)
       * @returns {HitArea}
       */
      get forceHitArea() {
          return this._forceHitArea
      }
      set forceHitArea(value) {
          if (value) {
              this._forceHitArea = value;
              this.hitArea = value;
          }
          else {
              this._forceHitArea = null;
              this.hitArea = new PIXI.Rectangle(0, 0, this.worldWidth, this.worldHeight);
          }
      }

      /**
       * enable one-finger touch to drag
       * NOTE: if you expect users to use right-click dragging, you should enable viewport.options.disableOnContextMenu to avoid the context menu popping up on each right-click drag
       * @param {DragOptions} [options]
       * @returns {Viewport} this
       */
      drag(options) {
          this.plugins.add('drag', new Drag(this, options));
          return this
      }

      /**
       * clamp to world boundaries or other provided boundaries
       * NOTES:
       *   clamp is disabled if called with no options; use { direction: 'all' } for all edge clamping
       *   screenWidth, screenHeight, worldWidth, and worldHeight needs to be set for this to work properly
       * @param {ClampOptions} [options]
       * @returns {Viewport} this
       */
      clamp(options) {
          this.plugins.add('clamp', new Clamp(this, options));
          return this
      }

      /**
       * decelerate after a move
       * NOTE: this fires 'moved' event during deceleration
       * @param {DecelerateOptions} [options]
       * @return {Viewport} this
       */
      decelerate(options) {
          this.plugins.add('decelerate', new Decelerate(this, options));
          return this
      }

      /**
       * bounce on borders
       * NOTES:
       *    screenWidth, screenHeight, worldWidth, and worldHeight needs to be set for this to work properly
       *    fires 'moved', 'bounce-x-start', 'bounce-y-start', 'bounce-x-end', and 'bounce-y-end' events
       * @param {object} [options]
       * @param {string} [options.sides=all] all, horizontal, vertical, or combination of top, bottom, right, left (e.g., 'top-bottom-right')
       * @param {number} [options.friction=0.5] friction to apply to decelerate if active
       * @param {number} [options.time=150] time in ms to finish bounce
       * @param {object} [options.bounceBox] use this bounceBox instead of (0, 0, viewport.worldWidth, viewport.worldHeight)
       * @param {number} [options.bounceBox.x=0]
       * @param {number} [options.bounceBox.y=0]
       * @param {number} [options.bounceBox.width=viewport.worldWidth]
       * @param {number} [options.bounceBox.height=viewport.worldHeight]
       * @param {string|function} [options.ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
       * @param {string} [options.underflow=center] (top/bottom/center and left/right/center, or center) where to place world if too small for screen
       * @return {Viewport} this
       */
      bounce(options) {
          this.plugins.add('bounce', new Bounce(this, options));
          return this
      }

      /**
       * enable pinch to zoom and two-finger touch to drag
       * @param {PinchOptions} [options]
       * @return {Viewport} this
       */
      pinch(options) {
          this.plugins.add('pinch', new Pinch(this, options));
          return this
      }

      /**
       * snap to a point
       * @param {number} x
       * @param {number} y
       * @param {SnapOptions} [options]
       * @return {Viewport} this
       */
      snap(x, y, options) {
          this.plugins.add('snap', new Snap(this, x, y, options));
          return this
      }

      /**
       * follow a target
       * NOTES:
       *    uses the (x, y) as the center to follow; for PIXI.Sprite to work properly, use sprite.anchor.set(0.5)
       *    options.acceleration is not perfect as it doesn't know the velocity of the target
       *    it adds acceleration to the start of movement and deceleration to the end of movement when the target is stopped
       *    fires 'moved' event
       * @param {PIXI.DisplayObject} target to follow
       * @param {FollowOptions} [options]
       * @returns {Viewport} this
       */
      follow(target, options) {
          this.plugins.add('follow', new Follow(this, target, options));
          return this
      }

      /**
       * zoom using mouse wheel
       * @param {WheelOptions} [options]
       * @return {Viewport} this
       */
      wheel(options) {
          this.plugins.add('wheel', new Wheel(this, options));
          return this
      }

      /**
       * animate the position and/or scale of the viewport
       * @param {AnimateOptions} options
       * @returns {Viewport} this
       */
      animate(options) {
          this.plugins.add('animate', new Animate(this, options));
          return this
      }

      /**
       * enable clamping of zoom to constraints
       * @description
       * The minWidth/Height settings are how small the world can get (as it would appear on the screen)
       * before clamping. The maxWidth/maxHeight is how larger the world can scale (as it would appear on
       * the screen) before clamping.
       *
       * For example, if you have a world size of 1000 x 1000 and a screen size of 100 x 100, if you set
       * minWidth/Height = 100 then the world will not be able to zoom smaller than the screen size (ie,
       * zooming out so it appears smaller than the screen). Similarly, if you set maxWidth/Height = 100
       * the world will not be able to zoom larger than the screen size (ie, zooming in so it appears
       * larger than the screen).
       * @param {ClampZoomOptions} [options]
       * @return {Viewport} this
       */
      clampZoom(options) {
          this.plugins.add('clamp-zoom', new ClampZoom(this, options));
          return this
      }

      /**
       * Scroll viewport when mouse hovers near one of the edges or radius-distance from center of screen.
       * NOTE: fires 'moved' event
       * @param {MouseEdgesOptions} [options]
       */
      mouseEdges(options) {
          this.plugins.add('mouse-edges', new MouseEdges(this, options));
          return this
      }

      /**
       * pause viewport (including animation updates such as decelerate)
       * @type {boolean}
       */
      get pause() {
          return this._pause
      }
      set pause(value) {
          this._pause = value;
          this.lastViewport = null;
          this.moving = false;
          this.zooming = false;
          if (value) {
              this.input.pause();
          }
      }

      /**
       * move the viewport so the bounding box is visible
       * @param {number} x - left
       * @param {number} y - top
       * @param {number} width
       * @param {number} height
       * @param {boolean} [resizeToFit] resize the viewport so the box fits within the viewport
       */
      ensureVisible(x, y, width, height, resizeToFit) {
          if (resizeToFit && (width > this.worldScreenWidth || height > this.worldScreenHeight)) {
              this.fit(true, width, height);
              this.emit('zoomed', { viewport: this, type: 'ensureVisible' });
          }
          let moved = false;
          if (x < this.left) {
              this.left = x;
              moved = true;
          }
          else if (x + width > this.right) {
              this.right = x + width;
              moved = true;
          }
          if (y < this.top) {
              this.top = y;
              moved = true;
          }
          else if (y + height > this.bottom) {
              this.bottom = y + height;
              moved = true;
          }
          if (moved) {
              this.emit('moved', { viewport: this, type: 'ensureVisible' });
          }
      }
  }

  /*!
   * @pixi/math - v5.3.9
   * Compiled Wed, 24 Mar 2021 19:54:16 UTC
   *
   * @pixi/math is licensed under the MIT License.
   * http://www.opensource.org/licenses/mit-license
   */
  /**
   * Two Pi.
   *
   * @static
   * @constant {number} PI_2
   * @memberof PIXI
   */
  var PI_2 = Math.PI * 2;
  var SHAPES;
  (function (SHAPES) {
      SHAPES[SHAPES["POLY"] = 0] = "POLY";
      SHAPES[SHAPES["RECT"] = 1] = "RECT";
      SHAPES[SHAPES["CIRC"] = 2] = "CIRC";
      SHAPES[SHAPES["ELIP"] = 3] = "ELIP";
      SHAPES[SHAPES["RREC"] = 4] = "RREC";
  })(SHAPES || (SHAPES = {}));
  /**
   * Constants that identify shapes, mainly to prevent `instanceof` calls.
   *
   * @static
   * @constant
   * @name SHAPES
   * @memberof PIXI
   * @type {enum}
   * @property {number} POLY Polygon
   * @property {number} RECT Rectangle
   * @property {number} CIRC Circle
   * @property {number} ELIP Ellipse
   * @property {number} RREC Rounded Rectangle
   * @enum {number}
   */

  /**
   * Size object, contains width and height
   *
   * @memberof PIXI
   * @typedef {object} ISize
   * @property {number} width - Width component
   * @property {number} height - Height component
   */
  /**
   * Rectangle object is an area defined by its position, as indicated by its top-left corner
   * point (x, y) and by its width and its height.
   *
   * @class
   * @memberof PIXI
   */
  var Rectangle = /** @class */ (function () {
      /**
       * @param {number} [x=0] - The X coordinate of the upper-left corner of the rectangle
       * @param {number} [y=0] - The Y coordinate of the upper-left corner of the rectangle
       * @param {number} [width=0] - The overall width of this rectangle
       * @param {number} [height=0] - The overall height of this rectangle
       */
      function Rectangle(x, y, width, height) {
          if (x === void 0) { x = 0; }
          if (y === void 0) { y = 0; }
          if (width === void 0) { width = 0; }
          if (height === void 0) { height = 0; }
          /**
           * @member {number}
           * @default 0
           */
          this.x = Number(x);
          /**
           * @member {number}
           * @default 0
           */
          this.y = Number(y);
          /**
           * @member {number}
           * @default 0
           */
          this.width = Number(width);
          /**
           * @member {number}
           * @default 0
           */
          this.height = Number(height);
          /**
           * The type of the object, mainly used to avoid `instanceof` checks
           *
           * @member {number}
           * @readOnly
           * @default PIXI.SHAPES.RECT
           * @see PIXI.SHAPES
           */
          this.type = SHAPES.RECT;
      }
      Object.defineProperty(Rectangle.prototype, "left", {
          /**
           * returns the left edge of the rectangle
           *
           * @member {number}
           */
          get: function () {
              return this.x;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Rectangle.prototype, "right", {
          /**
           * returns the right edge of the rectangle
           *
           * @member {number}
           */
          get: function () {
              return this.x + this.width;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Rectangle.prototype, "top", {
          /**
           * returns the top edge of the rectangle
           *
           * @member {number}
           */
          get: function () {
              return this.y;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Rectangle.prototype, "bottom", {
          /**
           * returns the bottom edge of the rectangle
           *
           * @member {number}
           */
          get: function () {
              return this.y + this.height;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Rectangle, "EMPTY", {
          /**
           * A constant empty rectangle.
           *
           * @static
           * @constant
           * @member {PIXI.Rectangle}
           * @return {PIXI.Rectangle} An empty rectangle
           */
          get: function () {
              return new Rectangle(0, 0, 0, 0);
          },
          enumerable: false,
          configurable: true
      });
      /**
       * Creates a clone of this Rectangle
       *
       * @return {PIXI.Rectangle} a copy of the rectangle
       */
      Rectangle.prototype.clone = function () {
          return new Rectangle(this.x, this.y, this.width, this.height);
      };
      /**
       * Copies another rectangle to this one.
       *
       * @param {PIXI.Rectangle} rectangle - The rectangle to copy from.
       * @return {PIXI.Rectangle} Returns itself.
       */
      Rectangle.prototype.copyFrom = function (rectangle) {
          this.x = rectangle.x;
          this.y = rectangle.y;
          this.width = rectangle.width;
          this.height = rectangle.height;
          return this;
      };
      /**
       * Copies this rectangle to another one.
       *
       * @param {PIXI.Rectangle} rectangle - The rectangle to copy to.
       * @return {PIXI.Rectangle} Returns given parameter.
       */
      Rectangle.prototype.copyTo = function (rectangle) {
          rectangle.x = this.x;
          rectangle.y = this.y;
          rectangle.width = this.width;
          rectangle.height = this.height;
          return rectangle;
      };
      /**
       * Checks whether the x and y coordinates given are contained within this Rectangle
       *
       * @param {number} x - The X coordinate of the point to test
       * @param {number} y - The Y coordinate of the point to test
       * @return {boolean} Whether the x/y coordinates are within this Rectangle
       */
      Rectangle.prototype.contains = function (x, y) {
          if (this.width <= 0 || this.height <= 0) {
              return false;
          }
          if (x >= this.x && x < this.x + this.width) {
              if (y >= this.y && y < this.y + this.height) {
                  return true;
              }
          }
          return false;
      };
      /**
       * Pads the rectangle making it grow in all directions.
       * If paddingY is omitted, both paddingX and paddingY will be set to paddingX.
       *
       * @param {number} [paddingX=0] - The horizontal padding amount.
       * @param {number} [paddingY=0] - The vertical padding amount.
       * @return {PIXI.Rectangle} Returns itself.
       */
      Rectangle.prototype.pad = function (paddingX, paddingY) {
          if (paddingX === void 0) { paddingX = 0; }
          if (paddingY === void 0) { paddingY = paddingX; }
          this.x -= paddingX;
          this.y -= paddingY;
          this.width += paddingX * 2;
          this.height += paddingY * 2;
          return this;
      };
      /**
       * Fits this rectangle around the passed one.
       *
       * @param {PIXI.Rectangle} rectangle - The rectangle to fit.
       * @return {PIXI.Rectangle} Returns itself.
       */
      Rectangle.prototype.fit = function (rectangle) {
          var x1 = Math.max(this.x, rectangle.x);
          var x2 = Math.min(this.x + this.width, rectangle.x + rectangle.width);
          var y1 = Math.max(this.y, rectangle.y);
          var y2 = Math.min(this.y + this.height, rectangle.y + rectangle.height);
          this.x = x1;
          this.width = Math.max(x2 - x1, 0);
          this.y = y1;
          this.height = Math.max(y2 - y1, 0);
          return this;
      };
      /**
       * Enlarges rectangle that way its corners lie on grid
       *
       * @param {number} [resolution=1] resolution
       * @param {number} [eps=0.001] precision
       * @return {PIXI.Rectangle} Returns itself.
       */
      Rectangle.prototype.ceil = function (resolution, eps) {
          if (resolution === void 0) { resolution = 1; }
          if (eps === void 0) { eps = 0.001; }
          var x2 = Math.ceil((this.x + this.width - eps) * resolution) / resolution;
          var y2 = Math.ceil((this.y + this.height - eps) * resolution) / resolution;
          this.x = Math.floor((this.x + eps) * resolution) / resolution;
          this.y = Math.floor((this.y + eps) * resolution) / resolution;
          this.width = x2 - this.x;
          this.height = y2 - this.y;
          return this;
      };
      /**
       * Enlarges this rectangle to include the passed rectangle.
       *
       * @param {PIXI.Rectangle} rectangle - The rectangle to include.
       * @return {PIXI.Rectangle} Returns itself.
       */
      Rectangle.prototype.enlarge = function (rectangle) {
          var x1 = Math.min(this.x, rectangle.x);
          var x2 = Math.max(this.x + this.width, rectangle.x + rectangle.width);
          var y1 = Math.min(this.y, rectangle.y);
          var y2 = Math.max(this.y + this.height, rectangle.y + rectangle.height);
          this.x = x1;
          this.width = x2 - x1;
          this.y = y1;
          this.height = y2 - y1;
          return this;
      };
      return Rectangle;
  }());

  /**
   * Common interface for points. Both Point and ObservablePoint implement it
   * @memberof PIXI
   * @interface IPointData
   */
  /**
   * X coord
   * @memberof PIXI.IPointData#
   * @member {number} x
   */
  /**
   * Y coord
   * @memberof PIXI.IPointData#
   * @member {number} y
   */

  /**
   * Common interface for points. Both Point and ObservablePoint implement it
   * @memberof PIXI
   * @interface IPoint
   * @extends PIXI.IPointData
   */
  /**
   * Sets the point to a new x and y position.
   * If y is omitted, both x and y will be set to x.
   *
   * @method set
   * @memberof PIXI.IPoint#
   * @param {number} [x=0] - position of the point on the x axis
   * @param {number} [y=x] - position of the point on the y axis
   */
  /**
   * Copies x and y from the given point
   * @method copyFrom
   * @memberof PIXI.IPoint#
   * @param {PIXI.IPointData} p - The point to copy from
   * @returns {this} Returns itself.
   */
  /**
   * Copies x and y into the given point
   * @method copyTo
   * @memberof PIXI.IPoint#
   * @param {PIXI.IPoint} p - The point to copy.
   * @returns {PIXI.IPoint} Given point with values updated
   */
  /**
   * Returns true if the given point is equal to this point
   *
   * @method equals
   * @memberof PIXI.IPoint#
   * @param {PIXI.IPointData} p - The point to check
   * @returns {boolean} Whether the given point equal to this point
   */

  /**
   * The Point object represents a location in a two-dimensional coordinate system, where x represents
   * the horizontal axis and y represents the vertical axis.
   *
   * @class
   * @memberof PIXI
   * @implements IPoint
   */
  var Point = /** @class */ (function () {
      /**
       * @param {number} [x=0] - position of the point on the x axis
       * @param {number} [y=0] - position of the point on the y axis
       */
      function Point(x, y) {
          if (x === void 0) { x = 0; }
          if (y === void 0) { y = 0; }
          /**
           * @member {number}
           * @default 0
           */
          this.x = x;
          /**
           * @member {number}
           * @default 0
           */
          this.y = y;
      }
      /**
       * Creates a clone of this point
       *
       * @return {PIXI.Point} a copy of the point
       */
      Point.prototype.clone = function () {
          return new Point(this.x, this.y);
      };
      /**
       * Copies x and y from the given point
       *
       * @param {PIXI.IPointData} p - The point to copy from
       * @returns {this} Returns itself.
       */
      Point.prototype.copyFrom = function (p) {
          this.set(p.x, p.y);
          return this;
      };
      /**
       * Copies x and y into the given point
       *
       * @param {PIXI.IPoint} p - The point to copy.
       * @returns {PIXI.IPoint} Given point with values updated
       */
      Point.prototype.copyTo = function (p) {
          p.set(this.x, this.y);
          return p;
      };
      /**
       * Returns true if the given point is equal to this point
       *
       * @param {PIXI.IPointData} p - The point to check
       * @returns {boolean} Whether the given point equal to this point
       */
      Point.prototype.equals = function (p) {
          return (p.x === this.x) && (p.y === this.y);
      };
      /**
       * Sets the point to a new x and y position.
       * If y is omitted, both x and y will be set to x.
       *
       * @param {number} [x=0] - position of the point on the x axis
       * @param {number} [y=x] - position of the point on the y axis
       * @returns {this} Returns itself.
       */
      Point.prototype.set = function (x, y) {
          if (x === void 0) { x = 0; }
          if (y === void 0) { y = x; }
          this.x = x;
          this.y = y;
          return this;
      };
      return Point;
  }());

  /**
   * The Point object represents a location in a two-dimensional coordinate system, where x represents
   * the horizontal axis and y represents the vertical axis.
   *
   * An ObservablePoint is a point that triggers a callback when the point's position is changed.
   *
   * @class
   * @memberof PIXI
   * @implements IPoint
   */
  var ObservablePoint = /** @class */ (function () {
      /**
       * @param {Function} cb - callback when changed
       * @param {object} scope - owner of callback
       * @param {number} [x=0] - position of the point on the x axis
       * @param {number} [y=0] - position of the point on the y axis
       */
      function ObservablePoint(cb, scope, x, y) {
          if (x === void 0) { x = 0; }
          if (y === void 0) { y = 0; }
          this._x = x;
          this._y = y;
          this.cb = cb;
          this.scope = scope;
      }
      /**
       * Creates a clone of this point.
       * The callback and scope params can be overidden otherwise they will default
       * to the clone object's values.
       *
       * @override
       * @param {Function} [cb=null] - callback when changed
       * @param {object} [scope=null] - owner of callback
       * @return {PIXI.ObservablePoint} a copy of the point
       */
      ObservablePoint.prototype.clone = function (cb, scope) {
          if (cb === void 0) { cb = this.cb; }
          if (scope === void 0) { scope = this.scope; }
          return new ObservablePoint(cb, scope, this._x, this._y);
      };
      /**
       * Sets the point to a new x and y position.
       * If y is omitted, both x and y will be set to x.
       *
       * @param {number} [x=0] - position of the point on the x axis
       * @param {number} [y=x] - position of the point on the y axis
       * @returns {this} Returns itself.
       */
      ObservablePoint.prototype.set = function (x, y) {
          if (x === void 0) { x = 0; }
          if (y === void 0) { y = x; }
          if (this._x !== x || this._y !== y) {
              this._x = x;
              this._y = y;
              this.cb.call(this.scope);
          }
          return this;
      };
      /**
       * Copies x and y from the given point
       *
       * @param {PIXI.IPointData} p - The point to copy from.
       * @returns {this} Returns itself.
       */
      ObservablePoint.prototype.copyFrom = function (p) {
          if (this._x !== p.x || this._y !== p.y) {
              this._x = p.x;
              this._y = p.y;
              this.cb.call(this.scope);
          }
          return this;
      };
      /**
       * Copies x and y into the given point
       *
       * @param {PIXI.IPoint} p - The point to copy.
       * @returns {PIXI.IPoint} Given point with values updated
       */
      ObservablePoint.prototype.copyTo = function (p) {
          p.set(this._x, this._y);
          return p;
      };
      /**
       * Returns true if the given point is equal to this point
       *
       * @param {PIXI.IPointData} p - The point to check
       * @returns {boolean} Whether the given point equal to this point
       */
      ObservablePoint.prototype.equals = function (p) {
          return (p.x === this._x) && (p.y === this._y);
      };
      Object.defineProperty(ObservablePoint.prototype, "x", {
          /**
           * The position of the displayObject on the x axis relative to the local coordinates of the parent.
           *
           * @member {number}
           */
          get: function () {
              return this._x;
          },
          set: function (value) {
              if (this._x !== value) {
                  this._x = value;
                  this.cb.call(this.scope);
              }
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(ObservablePoint.prototype, "y", {
          /**
           * The position of the displayObject on the x axis relative to the local coordinates of the parent.
           *
           * @member {number}
           */
          get: function () {
              return this._y;
          },
          set: function (value) {
              if (this._y !== value) {
                  this._y = value;
                  this.cb.call(this.scope);
              }
          },
          enumerable: false,
          configurable: true
      });
      return ObservablePoint;
  }());

  /**
   * The PixiJS Matrix as a class makes it a lot faster.
   *
   * Here is a representation of it:
   * ```js
   * | a | c | tx|
   * | b | d | ty|
   * | 0 | 0 | 1 |
   * ```
   * @class
   * @memberof PIXI
   */
  var Matrix = /** @class */ (function () {
      /**
       * @param {number} [a=1] - x scale
       * @param {number} [b=0] - x skew
       * @param {number} [c=0] - y skew
       * @param {number} [d=1] - y scale
       * @param {number} [tx=0] - x translation
       * @param {number} [ty=0] - y translation
       */
      function Matrix(a, b, c, d, tx, ty) {
          if (a === void 0) { a = 1; }
          if (b === void 0) { b = 0; }
          if (c === void 0) { c = 0; }
          if (d === void 0) { d = 1; }
          if (tx === void 0) { tx = 0; }
          if (ty === void 0) { ty = 0; }
          this.array = null;
          /**
           * @member {number}
           * @default 1
           */
          this.a = a;
          /**
           * @member {number}
           * @default 0
           */
          this.b = b;
          /**
           * @member {number}
           * @default 0
           */
          this.c = c;
          /**
           * @member {number}
           * @default 1
           */
          this.d = d;
          /**
           * @member {number}
           * @default 0
           */
          this.tx = tx;
          /**
           * @member {number}
           * @default 0
           */
          this.ty = ty;
      }
      /**
       * Creates a Matrix object based on the given array. The Element to Matrix mapping order is as follows:
       *
       * a = array[0]
       * b = array[1]
       * c = array[3]
       * d = array[4]
       * tx = array[2]
       * ty = array[5]
       *
       * @param {number[]} array - The array that the matrix will be populated from.
       */
      Matrix.prototype.fromArray = function (array) {
          this.a = array[0];
          this.b = array[1];
          this.c = array[3];
          this.d = array[4];
          this.tx = array[2];
          this.ty = array[5];
      };
      /**
       * sets the matrix properties
       *
       * @param {number} a - Matrix component
       * @param {number} b - Matrix component
       * @param {number} c - Matrix component
       * @param {number} d - Matrix component
       * @param {number} tx - Matrix component
       * @param {number} ty - Matrix component
       *
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.set = function (a, b, c, d, tx, ty) {
          this.a = a;
          this.b = b;
          this.c = c;
          this.d = d;
          this.tx = tx;
          this.ty = ty;
          return this;
      };
      /**
       * Creates an array from the current Matrix object.
       *
       * @param {boolean} transpose - Whether we need to transpose the matrix or not
       * @param {Float32Array} [out=new Float32Array(9)] - If provided the array will be assigned to out
       * @return {number[]} the newly created array which contains the matrix
       */
      Matrix.prototype.toArray = function (transpose, out) {
          if (!this.array) {
              this.array = new Float32Array(9);
          }
          var array = out || this.array;
          if (transpose) {
              array[0] = this.a;
              array[1] = this.b;
              array[2] = 0;
              array[3] = this.c;
              array[4] = this.d;
              array[5] = 0;
              array[6] = this.tx;
              array[7] = this.ty;
              array[8] = 1;
          }
          else {
              array[0] = this.a;
              array[1] = this.c;
              array[2] = this.tx;
              array[3] = this.b;
              array[4] = this.d;
              array[5] = this.ty;
              array[6] = 0;
              array[7] = 0;
              array[8] = 1;
          }
          return array;
      };
      /**
       * Get a new position with the current transformation applied.
       * Can be used to go from a child's coordinate space to the world coordinate space. (e.g. rendering)
       *
       * @param {PIXI.IPointData} pos - The origin
       * @param {PIXI.Point} [newPos] - The point that the new position is assigned to (allowed to be same as input)
       * @return {PIXI.Point} The new point, transformed through this matrix
       */
      Matrix.prototype.apply = function (pos, newPos) {
          newPos = (newPos || new Point());
          var x = pos.x;
          var y = pos.y;
          newPos.x = (this.a * x) + (this.c * y) + this.tx;
          newPos.y = (this.b * x) + (this.d * y) + this.ty;
          return newPos;
      };
      /**
       * Get a new position with the inverse of the current transformation applied.
       * Can be used to go from the world coordinate space to a child's coordinate space. (e.g. input)
       *
       * @param {PIXI.IPointData} pos - The origin
       * @param {PIXI.Point} [newPos] - The point that the new position is assigned to (allowed to be same as input)
       * @return {PIXI.Point} The new point, inverse-transformed through this matrix
       */
      Matrix.prototype.applyInverse = function (pos, newPos) {
          newPos = (newPos || new Point());
          var id = 1 / ((this.a * this.d) + (this.c * -this.b));
          var x = pos.x;
          var y = pos.y;
          newPos.x = (this.d * id * x) + (-this.c * id * y) + (((this.ty * this.c) - (this.tx * this.d)) * id);
          newPos.y = (this.a * id * y) + (-this.b * id * x) + (((-this.ty * this.a) + (this.tx * this.b)) * id);
          return newPos;
      };
      /**
       * Translates the matrix on the x and y.
       *
       * @param {number} x - How much to translate x by
       * @param {number} y - How much to translate y by
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.translate = function (x, y) {
          this.tx += x;
          this.ty += y;
          return this;
      };
      /**
       * Applies a scale transformation to the matrix.
       *
       * @param {number} x - The amount to scale horizontally
       * @param {number} y - The amount to scale vertically
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.scale = function (x, y) {
          this.a *= x;
          this.d *= y;
          this.c *= x;
          this.b *= y;
          this.tx *= x;
          this.ty *= y;
          return this;
      };
      /**
       * Applies a rotation transformation to the matrix.
       *
       * @param {number} angle - The angle in radians.
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.rotate = function (angle) {
          var cos = Math.cos(angle);
          var sin = Math.sin(angle);
          var a1 = this.a;
          var c1 = this.c;
          var tx1 = this.tx;
          this.a = (a1 * cos) - (this.b * sin);
          this.b = (a1 * sin) + (this.b * cos);
          this.c = (c1 * cos) - (this.d * sin);
          this.d = (c1 * sin) + (this.d * cos);
          this.tx = (tx1 * cos) - (this.ty * sin);
          this.ty = (tx1 * sin) + (this.ty * cos);
          return this;
      };
      /**
       * Appends the given Matrix to this Matrix.
       *
       * @param {PIXI.Matrix} matrix - The matrix to append.
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.append = function (matrix) {
          var a1 = this.a;
          var b1 = this.b;
          var c1 = this.c;
          var d1 = this.d;
          this.a = (matrix.a * a1) + (matrix.b * c1);
          this.b = (matrix.a * b1) + (matrix.b * d1);
          this.c = (matrix.c * a1) + (matrix.d * c1);
          this.d = (matrix.c * b1) + (matrix.d * d1);
          this.tx = (matrix.tx * a1) + (matrix.ty * c1) + this.tx;
          this.ty = (matrix.tx * b1) + (matrix.ty * d1) + this.ty;
          return this;
      };
      /**
       * Sets the matrix based on all the available properties
       *
       * @param {number} x - Position on the x axis
       * @param {number} y - Position on the y axis
       * @param {number} pivotX - Pivot on the x axis
       * @param {number} pivotY - Pivot on the y axis
       * @param {number} scaleX - Scale on the x axis
       * @param {number} scaleY - Scale on the y axis
       * @param {number} rotation - Rotation in radians
       * @param {number} skewX - Skew on the x axis
       * @param {number} skewY - Skew on the y axis
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.setTransform = function (x, y, pivotX, pivotY, scaleX, scaleY, rotation, skewX, skewY) {
          this.a = Math.cos(rotation + skewY) * scaleX;
          this.b = Math.sin(rotation + skewY) * scaleX;
          this.c = -Math.sin(rotation - skewX) * scaleY;
          this.d = Math.cos(rotation - skewX) * scaleY;
          this.tx = x - ((pivotX * this.a) + (pivotY * this.c));
          this.ty = y - ((pivotX * this.b) + (pivotY * this.d));
          return this;
      };
      /**
       * Prepends the given Matrix to this Matrix.
       *
       * @param {PIXI.Matrix} matrix - The matrix to prepend
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.prepend = function (matrix) {
          var tx1 = this.tx;
          if (matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1) {
              var a1 = this.a;
              var c1 = this.c;
              this.a = (a1 * matrix.a) + (this.b * matrix.c);
              this.b = (a1 * matrix.b) + (this.b * matrix.d);
              this.c = (c1 * matrix.a) + (this.d * matrix.c);
              this.d = (c1 * matrix.b) + (this.d * matrix.d);
          }
          this.tx = (tx1 * matrix.a) + (this.ty * matrix.c) + matrix.tx;
          this.ty = (tx1 * matrix.b) + (this.ty * matrix.d) + matrix.ty;
          return this;
      };
      /**
       * Decomposes the matrix (x, y, scaleX, scaleY, and rotation) and sets the properties on to a transform.
       *
       * @param {PIXI.Transform} transform - The transform to apply the properties to.
       * @return {PIXI.Transform} The transform with the newly applied properties
       */
      Matrix.prototype.decompose = function (transform) {
          // sort out rotation / skew..
          var a = this.a;
          var b = this.b;
          var c = this.c;
          var d = this.d;
          var skewX = -Math.atan2(-c, d);
          var skewY = Math.atan2(b, a);
          var delta = Math.abs(skewX + skewY);
          if (delta < 0.00001 || Math.abs(PI_2 - delta) < 0.00001) {
              transform.rotation = skewY;
              transform.skew.x = transform.skew.y = 0;
          }
          else {
              transform.rotation = 0;
              transform.skew.x = skewX;
              transform.skew.y = skewY;
          }
          // next set scale
          transform.scale.x = Math.sqrt((a * a) + (b * b));
          transform.scale.y = Math.sqrt((c * c) + (d * d));
          // next set position
          transform.position.x = this.tx;
          transform.position.y = this.ty;
          return transform;
      };
      /**
       * Inverts this matrix
       *
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.invert = function () {
          var a1 = this.a;
          var b1 = this.b;
          var c1 = this.c;
          var d1 = this.d;
          var tx1 = this.tx;
          var n = (a1 * d1) - (b1 * c1);
          this.a = d1 / n;
          this.b = -b1 / n;
          this.c = -c1 / n;
          this.d = a1 / n;
          this.tx = ((c1 * this.ty) - (d1 * tx1)) / n;
          this.ty = -((a1 * this.ty) - (b1 * tx1)) / n;
          return this;
      };
      /**
       * Resets this Matrix to an identity (default) matrix.
       *
       * @return {PIXI.Matrix} This matrix. Good for chaining method calls.
       */
      Matrix.prototype.identity = function () {
          this.a = 1;
          this.b = 0;
          this.c = 0;
          this.d = 1;
          this.tx = 0;
          this.ty = 0;
          return this;
      };
      /**
       * Creates a new Matrix object with the same values as this one.
       *
       * @return {PIXI.Matrix} A copy of this matrix. Good for chaining method calls.
       */
      Matrix.prototype.clone = function () {
          var matrix = new Matrix();
          matrix.a = this.a;
          matrix.b = this.b;
          matrix.c = this.c;
          matrix.d = this.d;
          matrix.tx = this.tx;
          matrix.ty = this.ty;
          return matrix;
      };
      /**
       * Changes the values of the given matrix to be the same as the ones in this matrix
       *
       * @param {PIXI.Matrix} matrix - The matrix to copy to.
       * @return {PIXI.Matrix} The matrix given in parameter with its values updated.
       */
      Matrix.prototype.copyTo = function (matrix) {
          matrix.a = this.a;
          matrix.b = this.b;
          matrix.c = this.c;
          matrix.d = this.d;
          matrix.tx = this.tx;
          matrix.ty = this.ty;
          return matrix;
      };
      /**
       * Changes the values of the matrix to be the same as the ones in given matrix
       *
       * @param {PIXI.Matrix} matrix - The matrix to copy from.
       * @return {PIXI.Matrix} this
       */
      Matrix.prototype.copyFrom = function (matrix) {
          this.a = matrix.a;
          this.b = matrix.b;
          this.c = matrix.c;
          this.d = matrix.d;
          this.tx = matrix.tx;
          this.ty = matrix.ty;
          return this;
      };
      Object.defineProperty(Matrix, "IDENTITY", {
          /**
           * A default (identity) matrix
           *
           * @static
           * @const
           * @member {PIXI.Matrix}
           */
          get: function () {
              return new Matrix();
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Matrix, "TEMP_MATRIX", {
          /**
           * A temp matrix
           *
           * @static
           * @const
           * @member {PIXI.Matrix}
           */
          get: function () {
              return new Matrix();
          },
          enumerable: false,
          configurable: true
      });
      return Matrix;
  }());

  // Your friendly neighbour https://en.wikipedia.org/wiki/Dihedral_group
  /*
   * Transform matrix for operation n is:
   * | ux | vx |
   * | uy | vy |
   */
  var ux = [1, 1, 0, -1, -1, -1, 0, 1, 1, 1, 0, -1, -1, -1, 0, 1];
  var uy = [0, 1, 1, 1, 0, -1, -1, -1, 0, 1, 1, 1, 0, -1, -1, -1];
  var vx = [0, -1, -1, -1, 0, 1, 1, 1, 0, 1, 1, 1, 0, -1, -1, -1];
  var vy = [1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, 1, 1, 1, 0, -1];
  /*
   * Alias for {@code Math.sign}.
   */
  var signum = Math.sign;
  /*
   * Initializes `rotationCayley` and `rotationMatrices`. It is called
   * only once below.
   */
  function init() {
      for (var i = 0; i < 16; i++) {
          var row = [];
          for (var j = 0; j < 16; j++) {
              /* Multiplies rotation matrices i and j. */
              var _ux = signum((ux[i] * ux[j]) + (vx[i] * uy[j]));
              var _uy = signum((uy[i] * ux[j]) + (vy[i] * uy[j]));
              var _vx = signum((ux[i] * vx[j]) + (vx[i] * vy[j]));
              var _vy = signum((uy[i] * vx[j]) + (vy[i] * vy[j]));
              /* Finds rotation matrix matching the product and pushes it. */
              for (var k = 0; k < 16; k++) {
                  if (ux[k] === _ux && uy[k] === _uy
                      && vx[k] === _vx && vy[k] === _vy) {
                      row.push(k);
                      break;
                  }
              }
          }
      }
      for (var i = 0; i < 16; i++) {
          var mat = new Matrix();
          mat.set(ux[i], uy[i], vx[i], vy[i], 0, 0);
      }
  }
  init();

  /**
   * Transform that takes care about its versions
   *
   * @class
   * @memberof PIXI
   */
  /** @class */ ((function () {
      function Transform() {
          /**
           * The world transformation matrix.
           *
           * @member {PIXI.Matrix}
           */
          this.worldTransform = new Matrix();
          /**
           * The local transformation matrix.
           *
           * @member {PIXI.Matrix}
           */
          this.localTransform = new Matrix();
          /**
           * The coordinate of the object relative to the local coordinates of the parent.
           *
           * @member {PIXI.ObservablePoint}
           */
          this.position = new ObservablePoint(this.onChange, this, 0, 0);
          /**
           * The scale factor of the object.
           *
           * @member {PIXI.ObservablePoint}
           */
          this.scale = new ObservablePoint(this.onChange, this, 1, 1);
          /**
           * The pivot point of the displayObject that it rotates around.
           *
           * @member {PIXI.ObservablePoint}
           */
          this.pivot = new ObservablePoint(this.onChange, this, 0, 0);
          /**
           * The skew amount, on the x and y axis.
           *
           * @member {PIXI.ObservablePoint}
           */
          this.skew = new ObservablePoint(this.updateSkew, this, 0, 0);
          /**
           * The rotation amount.
           *
           * @protected
           * @member {number}
           */
          this._rotation = 0;
          /**
           * The X-coordinate value of the normalized local X axis,
           * the first column of the local transformation matrix without a scale.
           *
           * @protected
           * @member {number}
           */
          this._cx = 1;
          /**
           * The Y-coordinate value of the normalized local X axis,
           * the first column of the local transformation matrix without a scale.
           *
           * @protected
           * @member {number}
           */
          this._sx = 0;
          /**
           * The X-coordinate value of the normalized local Y axis,
           * the second column of the local transformation matrix without a scale.
           *
           * @protected
           * @member {number}
           */
          this._cy = 0;
          /**
           * The Y-coordinate value of the normalized local Y axis,
           * the second column of the local transformation matrix without a scale.
           *
           * @protected
           * @member {number}
           */
          this._sy = 1;
          /**
           * The locally unique ID of the local transform.
           *
           * @protected
           * @member {number}
           */
          this._localID = 0;
          /**
           * The locally unique ID of the local transform
           * used to calculate the current local transformation matrix.
           *
           * @protected
           * @member {number}
           */
          this._currentLocalID = 0;
          /**
           * The locally unique ID of the world transform.
           *
           * @protected
           * @member {number}
           */
          this._worldID = 0;
          /**
           * The locally unique ID of the parent's world transform
           * used to calculate the current world transformation matrix.
           *
           * @protected
           * @member {number}
           */
          this._parentID = 0;
      }
      /**
       * Called when a value changes.
       *
       * @protected
       */
      Transform.prototype.onChange = function () {
          this._localID++;
      };
      /**
       * Called when the skew or the rotation changes.
       *
       * @protected
       */
      Transform.prototype.updateSkew = function () {
          this._cx = Math.cos(this._rotation + this.skew.y);
          this._sx = Math.sin(this._rotation + this.skew.y);
          this._cy = -Math.sin(this._rotation - this.skew.x); // cos, added PI/2
          this._sy = Math.cos(this._rotation - this.skew.x); // sin, added PI/2
          this._localID++;
      };
      /**
       * Updates the local transformation matrix.
       */
      Transform.prototype.updateLocalTransform = function () {
          var lt = this.localTransform;
          if (this._localID !== this._currentLocalID) {
              // get the matrix values of the displayobject based on its transform properties..
              lt.a = this._cx * this.scale.x;
              lt.b = this._sx * this.scale.x;
              lt.c = this._cy * this.scale.y;
              lt.d = this._sy * this.scale.y;
              lt.tx = this.position.x - ((this.pivot.x * lt.a) + (this.pivot.y * lt.c));
              lt.ty = this.position.y - ((this.pivot.x * lt.b) + (this.pivot.y * lt.d));
              this._currentLocalID = this._localID;
              // force an update..
              this._parentID = -1;
          }
      };
      /**
       * Updates the local and the world transformation matrices.
       *
       * @param {PIXI.Transform} parentTransform - The parent transform
       */
      Transform.prototype.updateTransform = function (parentTransform) {
          var lt = this.localTransform;
          if (this._localID !== this._currentLocalID) {
              // get the matrix values of the displayobject based on its transform properties..
              lt.a = this._cx * this.scale.x;
              lt.b = this._sx * this.scale.x;
              lt.c = this._cy * this.scale.y;
              lt.d = this._sy * this.scale.y;
              lt.tx = this.position.x - ((this.pivot.x * lt.a) + (this.pivot.y * lt.c));
              lt.ty = this.position.y - ((this.pivot.x * lt.b) + (this.pivot.y * lt.d));
              this._currentLocalID = this._localID;
              // force an update..
              this._parentID = -1;
          }
          if (this._parentID !== parentTransform._worldID) {
              // concat the parent matrix with the objects transform.
              var pt = parentTransform.worldTransform;
              var wt = this.worldTransform;
              wt.a = (lt.a * pt.a) + (lt.b * pt.c);
              wt.b = (lt.a * pt.b) + (lt.b * pt.d);
              wt.c = (lt.c * pt.a) + (lt.d * pt.c);
              wt.d = (lt.c * pt.b) + (lt.d * pt.d);
              wt.tx = (lt.tx * pt.a) + (lt.ty * pt.c) + pt.tx;
              wt.ty = (lt.tx * pt.b) + (lt.ty * pt.d) + pt.ty;
              this._parentID = parentTransform._worldID;
              // update the id of the transform..
              this._worldID++;
          }
      };
      /**
       * Decomposes a matrix and sets the transforms properties based on it.
       *
       * @param {PIXI.Matrix} matrix - The matrix to decompose
       */
      Transform.prototype.setFromMatrix = function (matrix) {
          matrix.decompose(this);
          this._localID++;
      };
      Object.defineProperty(Transform.prototype, "rotation", {
          /**
           * The rotation of the object in radians.
           *
           * @member {number}
           */
          get: function () {
              return this._rotation;
          },
          set: function (value) {
              if (this._rotation !== value) {
                  this._rotation = value;
                  this.updateSkew();
              }
          },
          enumerable: false,
          configurable: true
      });
      /**
       * A default (identity) transform
       *
       * @static
       * @constant
       * @member {PIXI.Transform}
       */
      Transform.IDENTITY = new Transform();
      return Transform;
  })());

  /* eslint-disable */

  const tempRect = new Rectangle();

  /**
   * The culling options for {@code Cull}.
   *
   * @ignore
   * @public
   */






  /**
   * Provides a simple, configurable mechanism for culling a subtree of your scene graph.
   *
   * If your scene graph is not static, culling needs to be done before rendering. You
   * can run it on the `prerender` event fired by the renderer.
   *
   * @public
   */
  class Cull
  {
      
      
      

      /**
       * @param options
       * @param [options.recursive] - whether culling should be recursive
       * @param [options.toggle='renderable'] - which property of display-object was be set to indicate
       *      its culling state. It should be one of `renderable`, `visible`.
       */
      constructor(options = {})
      {
          this._recursive = typeof options.recursive === 'boolean' ? options.recursive : true;
          this._toggle = options.toggle || 'visible';
          this._targetList = new Set();
      }

      /**
       * Adds a display-object to the culling list
       *
       * @param target - the display-object to be culled
       * @return this
       */
      add(target)
      {
          this._targetList.add(target);

          return this;
      }

      /**
       * Adds all the display-objects to the culling list
       *
       * @param targets - the display-objects to be culled
       * @return this
       */
      addAll(targets)
      {
          for (let i = 0, j = targets.length; i < j; i++)
          {
              this._targetList.add(targets[i]);
          }

          return this;
      }

      /**
       * Removes the display-object from the culling list
       *
       * @param target - the display-object to be removed
       * @return this
       */
      remove(target)
      {
          this._targetList.delete(target);

          return this;
      }

      /**
       * Removes all the passed display-objects from the culling list
       *
       * @param targets - the display-objects to be removed
       * @return this
       */
      removeAll(targets)
      {
          for (let i = 0, j = targets.length; i < j; i++)
          {
              this._targetList.delete(targets[i]);
          }

          return this;
      }

      /**
       * Clears the culling list
       *
       * @return this
       */
      clear()
      {
          this._targetList.clear();

          return this;
      }

      /**
       * @param rect - the rectangle outside of which display-objects should be culled
       * @param skipUpdate - whether to skip unculling, transform update, bounds calculation. It is
       *  highly recommended you enable this by calling _this.uncull()_ and _root.getBounds(false)_ manually
       *  before your render loop.
       * @return this
       */
      cull(rect, skipUpdate = false)
      {
          if (!skipUpdate)
          {
              this.uncull();
          }

          this._targetList.forEach((target) =>
          {
              if (!skipUpdate)
              {
                  // Update transforms, bounds of display-objects in this target's subtree
                  target.getBounds(false, tempRect);
              }

              if (this._recursive)
              {
                  this.cullRecursive(rect, target, skipUpdate);
              }
              else
              {
                  // NOTE: If skipUpdate is false, then tempRect already contains the bounds of the target
                  if (skipUpdate)
                  {
                      target._bounds.getRectangle(rect);
                  }

                  target[this._toggle] = tempRect.right > rect.left
                      && tempRect.left < rect.right
                      && tempRect.bottom > rect.top
                      && tempRect.top < rect.bottom;
              }
          });

          return this;
      }

      /**
       * Sets all display-objects to the unculled state.
       *
       * This happens regardless of whether the culling toggle was set by {@code this.cull} or manually. This
       * is why it is recommended to one of `visible` or `renderable` for normal use and the other for culling.
       *
       * @return this
       */
      uncull()
      {
          this._targetList.forEach((target) =>
          {
              if (this._recursive)
              {
                  this.uncullRecursive(target);
              }
              else
              {
                  target[this._toggle] = false;
              }
          });

          return this;
      }

      /**
       * Recursively culls the subtree of {@code displayObject}.
       *
       * @param rect - the visiblity rectangle
       * @param displayObject - the root of the subtree to cull
       * @param skipUpdate - whether to skip bounds calculation. However, transforms are expected to be updated by the caller.
       */
       cullRecursive(rect, displayObject, skipUpdate)
      {
          // NOTE: getBounds can skipUpdate because updateTransform is invoked before culling.
          const bounds = skipUpdate
              ? displayObject._bounds.getRectangle(tempRect)
              : displayObject.getBounds(true, tempRect);

          displayObject[this._toggle] = bounds.right > rect.left
              && bounds.left < rect.right
              && bounds.bottom > rect.top
              && bounds.top < rect.bottom;

          const fullyVisible = bounds.left >= rect.left
              && bounds.top >= rect.top
              && bounds.right <= rect.right
              && bounds.bottom <= rect.bottom;

          // Only cull children if this display-object is *not* fully-visible. It is expected that the bounds
          // of children lie inside of its own. Hence, further culling is only required if the display-object
          // intersects with the boundaries of "rect". Otherwise, if the object is fully outside/inside the
          // screen, the children don't need to be evaluated as they are presumed to be unculled.
          if (!fullyVisible
                  && displayObject[this._toggle]
                  && (displayObject ).children
                  && (displayObject ).children.length)
          {
              const children = (displayObject ).children;

              for (let i = 0, j = children.length; i < j; i++)
              {
                  this.cullRecursive(rect, children[i]);
              }
          }
      }

      /**
       * Recursively unculls the subtree of {@code displayObject}.
       *
       * @param displayObject
       */
       uncullRecursive(displayObject)
      {
          displayObject[this._toggle] = true;

          if ((displayObject ).children && (displayObject ).children.length)
          {
              const children = (displayObject ).children;

              for (let i = 0, j = children.length; i < j; i++)
              {
                  this.uncullRecursive(children[i]);
              }
          }
      }
  }

  function createCommonjsModule(fn, basedir, module) {
  	return module = {
  		path: basedir,
  		exports: {},
  		require: function (path, base) {
  			return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
  		}
  	}, fn(module, module.exports), module.exports;
  }

  function commonjsRequire () {
  	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
  }

  // Copyright Joyent, Inc. and other Node contributors.

  var R = typeof Reflect === 'object' ? Reflect : null;
  var ReflectApply = R && typeof R.apply === 'function'
    ? R.apply
    : function ReflectApply(target, receiver, args) {
      return Function.prototype.apply.call(target, receiver, args);
    };

  var ReflectOwnKeys;
  if (R && typeof R.ownKeys === 'function') {
    ReflectOwnKeys = R.ownKeys;
  } else if (Object.getOwnPropertySymbols) {
    ReflectOwnKeys = function ReflectOwnKeys(target) {
      return Object.getOwnPropertyNames(target)
        .concat(Object.getOwnPropertySymbols(target));
    };
  } else {
    ReflectOwnKeys = function ReflectOwnKeys(target) {
      return Object.getOwnPropertyNames(target);
    };
  }

  function ProcessEmitWarning(warning) {
    if (console && console.warn) console.warn(warning);
  }

  var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
    return value !== value;
  };

  function EventEmitter() {
    EventEmitter.init.call(this);
  }
  var events = EventEmitter;
  var once_1 = once;

  // Backwards-compat with node 0.10.x
  EventEmitter.EventEmitter = EventEmitter;

  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._eventsCount = 0;
  EventEmitter.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  var defaultMaxListeners = 10;

  function checkListener(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
    }
  }

  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
        throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
      }
      defaultMaxListeners = arg;
    }
  });

  EventEmitter.init = function() {

    if (this._events === undefined ||
        this._events === Object.getPrototypeOf(this)._events) {
      this._events = Object.create(null);
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
      throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
    }
    this._maxListeners = n;
    return this;
  };

  function _getMaxListeners(that) {
    if (that._maxListeners === undefined)
      return EventEmitter.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return _getMaxListeners(this);
  };

  EventEmitter.prototype.emit = function emit(type) {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var doError = (type === 'error');

    var events = this._events;
    if (events !== undefined)
      doError = (doError && events.error === undefined);
    else if (!doError)
      return false;

    // If there is no 'error' event listener then throw.
    if (doError) {
      var er;
      if (args.length > 0)
        er = args[0];
      if (er instanceof Error) {
        // Note: The comments on the `throw` lines are intentional, they show
        // up in Node's output if this results in an unhandled exception.
        throw er; // Unhandled 'error' event
      }
      // At least give some kind of context to the user
      var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
      err.context = er;
      throw err; // Unhandled 'error' event
    }

    var handler = events[type];

    if (handler === undefined)
      return false;

    if (typeof handler === 'function') {
      ReflectApply(handler, this, args);
    } else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        ReflectApply(listeners[i], this, args);
    }

    return true;
  };

  function _addListener(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    checkListener(listener);

    events = target._events;
    if (events === undefined) {
      events = target._events = Object.create(null);
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener !== undefined) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (existing === undefined) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
        // If we've already got an array, just append.
      } else if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }

      // Check for listener leak
      m = _getMaxListeners(target);
      if (m > 0 && existing.length > m && !existing.warned) {
        existing.warned = true;
        // No error code for this since it is a Warning
        // eslint-disable-next-line no-restricted-syntax
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + String(type) + ' listeners ' +
                            'added. Use emitter.setMaxListeners() to ' +
                            'increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        ProcessEmitWarning(w);
      }
    }

    return target;
  }

  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return _addListener(this, type, listener, false);
  };

  EventEmitter.prototype.on = EventEmitter.prototype.addListener;

  EventEmitter.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };

  function onceWrapper() {
    if (!this.fired) {
      this.target.removeListener(this.type, this.wrapFn);
      this.fired = true;
      if (arguments.length === 0)
        return this.listener.call(this.target);
      return this.listener.apply(this.target, arguments);
    }
  }

  function _onceWrap(target, type, listener) {
    var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
    var wrapped = onceWrapper.bind(state);
    wrapped.listener = listener;
    state.wrapFn = wrapped;
    return wrapped;
  }

  EventEmitter.prototype.once = function once(type, listener) {
    checkListener(listener);
    this.on(type, _onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        checkListener(listener);
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };

  // Emits a 'removeListener' event if and only if the listener was removed.
  EventEmitter.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        checkListener(listener);

        events = this._events;
        if (events === undefined)
          return this;

        list = events[type];
        if (list === undefined)
          return this;

        if (list === listener || list.listener === listener) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length - 1; i >= 0; i--) {
            if (list[i] === listener || list[i].listener === listener) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (position === 0)
            list.shift();
          else {
            spliceOne(list, position);
          }

          if (list.length === 1)
            events[type] = list[0];

          if (events.removeListener !== undefined)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

  EventEmitter.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events, i;

        events = this._events;
        if (events === undefined)
          return this;

        // not listening for removeListener, no need to emit
        if (events.removeListener === undefined) {
          if (arguments.length === 0) {
            this._events = Object.create(null);
            this._eventsCount = 0;
          } else if (events[type] !== undefined) {
            if (--this._eventsCount === 0)
              this._events = Object.create(null);
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          var key;
          for (i = 0; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = Object.create(null);
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners !== undefined) {
          // LIFO order
          for (i = listeners.length - 1; i >= 0; i--) {
            this.removeListener(type, listeners[i]);
          }
        }

        return this;
      };

  function _listeners(target, type, unwrap) {
    var events = target._events;

    if (events === undefined)
      return [];

    var evlistener = events[type];
    if (evlistener === undefined)
      return [];

    if (typeof evlistener === 'function')
      return unwrap ? [evlistener.listener || evlistener] : [evlistener];

    return unwrap ?
      unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
  }

  EventEmitter.prototype.listeners = function listeners(type) {
    return _listeners(this, type, true);
  };

  EventEmitter.prototype.rawListeners = function rawListeners(type) {
    return _listeners(this, type, false);
  };

  EventEmitter.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount.call(emitter, type);
    }
  };

  EventEmitter.prototype.listenerCount = listenerCount;
  function listenerCount(type) {
    var events = this._events;

    if (events !== undefined) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener !== undefined) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
  };

  function arrayClone(arr, n) {
    var copy = new Array(n);
    for (var i = 0; i < n; ++i)
      copy[i] = arr[i];
    return copy;
  }

  function spliceOne(list, index) {
    for (; index + 1 < list.length; index++)
      list[index] = list[index + 1];
    list.pop();
  }

  function unwrapListeners(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  function once(emitter, name) {
    return new Promise(function (resolve, reject) {
      function errorListener(err) {
        emitter.removeListener(name, resolver);
        reject(err);
      }

      function resolver() {
        if (typeof emitter.removeListener === 'function') {
          emitter.removeListener('error', errorListener);
        }
        resolve([].slice.call(arguments));
      }
      eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
      if (name !== 'error') {
        addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
      }
    });
  }

  function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
    if (typeof emitter.on === 'function') {
      eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
    }
  }

  function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
    if (typeof emitter.on === 'function') {
      if (flags.once) {
        emitter.once(name, listener);
      } else {
        emitter.on(name, listener);
      }
    } else if (typeof emitter.addEventListener === 'function') {
      // EventTarget does not have `error` event semantics like Node
      // EventEmitters, we do not listen for `error` events here.
      emitter.addEventListener(name, function wrapListener(arg) {
        // IE does not have builtin `{ once: true }` support so we
        // have to do it manually.
        if (flags.once) {
          emitter.removeEventListener(name, wrapListener);
        }
        listener(arg);
      });
    } else {
      throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
    }
  }
  events.once = once_1;

  var lib = createCommonjsModule(function (module, exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TypedEmitter = events.EventEmitter;
  });

  var isMergeableObject = function isMergeableObject(value) {
  	return isNonNullObject(value)
  		&& !isSpecial(value)
  };

  function isNonNullObject(value) {
  	return !!value && typeof value === 'object'
  }

  function isSpecial(value) {
  	var stringValue = Object.prototype.toString.call(value);

  	return stringValue === '[object RegExp]'
  		|| stringValue === '[object Date]'
  		|| isReactElement(value)
  }

  // see https://github.com/facebook/react/blob/b5ac963fb791d1298e7f396236383bc955f916c1/src/isomorphic/classic/element/ReactElement.js#L21-L25
  var canUseSymbol = typeof Symbol === 'function' && Symbol.for;
  var REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for('react.element') : 0xeac7;

  function isReactElement(value) {
  	return value.$$typeof === REACT_ELEMENT_TYPE
  }

  function emptyTarget(val) {
  	return Array.isArray(val) ? [] : {}
  }

  function cloneUnlessOtherwiseSpecified(value, options) {
  	return (options.clone !== false && options.isMergeableObject(value))
  		? deepmerge(emptyTarget(value), value, options)
  		: value
  }

  function defaultArrayMerge(target, source, options) {
  	return target.concat(source).map(function(element) {
  		return cloneUnlessOtherwiseSpecified(element, options)
  	})
  }

  function getMergeFunction(key, options) {
  	if (!options.customMerge) {
  		return deepmerge
  	}
  	var customMerge = options.customMerge(key);
  	return typeof customMerge === 'function' ? customMerge : deepmerge
  }

  function getEnumerableOwnPropertySymbols(target) {
  	return Object.getOwnPropertySymbols
  		? Object.getOwnPropertySymbols(target).filter(function(symbol) {
  			return target.propertyIsEnumerable(symbol)
  		})
  		: []
  }

  function getKeys(target) {
  	return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target))
  }

  function propertyIsOnObject(object, property) {
  	try {
  		return property in object
  	} catch(_) {
  		return false
  	}
  }

  // Protects from prototype poisoning and unexpected merging up the prototype chain.
  function propertyIsUnsafe(target, key) {
  	return propertyIsOnObject(target, key) // Properties are safe to merge if they don't exist in the target yet,
  		&& !(Object.hasOwnProperty.call(target, key) // unsafe if they exist up the prototype chain,
  			&& Object.propertyIsEnumerable.call(target, key)) // and also unsafe if they're nonenumerable.
  }

  function mergeObject(target, source, options) {
  	var destination = {};
  	if (options.isMergeableObject(target)) {
  		getKeys(target).forEach(function(key) {
  			destination[key] = cloneUnlessOtherwiseSpecified(target[key], options);
  		});
  	}
  	getKeys(source).forEach(function(key) {
  		if (propertyIsUnsafe(target, key)) {
  			return
  		}

  		if (propertyIsOnObject(target, key) && options.isMergeableObject(source[key])) {
  			destination[key] = getMergeFunction(key, options)(target[key], source[key], options);
  		} else {
  			destination[key] = cloneUnlessOtherwiseSpecified(source[key], options);
  		}
  	});
  	return destination
  }

  function deepmerge(target, source, options) {
  	options = options || {};
  	options.arrayMerge = options.arrayMerge || defaultArrayMerge;
  	options.isMergeableObject = options.isMergeableObject || isMergeableObject;
  	// cloneUnlessOtherwiseSpecified is added to `options` so that custom arrayMerge()
  	// implementations can use it. The caller may not replace it.
  	options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified;

  	var sourceIsArray = Array.isArray(source);
  	var targetIsArray = Array.isArray(target);
  	var sourceAndTargetTypesMatch = sourceIsArray === targetIsArray;

  	if (!sourceAndTargetTypesMatch) {
  		return cloneUnlessOtherwiseSpecified(source, options)
  	} else if (sourceIsArray) {
  		return options.arrayMerge(target, source, options)
  	} else {
  		return mergeObject(target, source, options)
  	}
  }

  deepmerge.all = function deepmergeAll(array, options) {
  	if (!Array.isArray(array)) {
  		throw new Error('first argument should be an array')
  	}

  	return array.reduce(function(prev, next) {
  		return deepmerge(prev, next, options)
  	}, {})
  };

  var deepmerge_1 = deepmerge;

  var cjs = deepmerge_1;

  function resolveStyleDefinition(styleDefinition, attributes) {
      var style;
      if (styleDefinition instanceof Function) {
          style = styleDefinition(attributes);
      }
      else if (typeof styleDefinition === 'object' && styleDefinition !== null) {
          style = Object.fromEntries(Object.entries(styleDefinition).map(function (_a) {
              var key = _a[0], styleDefinition = _a[1];
              return [key, resolveStyleDefinition(styleDefinition, attributes)];
          }));
      }
      else {
          style = styleDefinition;
      }
      return style;
  }
  function resolveStyleDefinitions(styleDefinitions, attributes) {
      var styles = styleDefinitions.filter(function (x) { return !!x; }).map(function (styleDefinition) { return resolveStyleDefinition(styleDefinition, attributes); });
      var style = cjs.all(styles);
      return style;
  }

  var TextureCache = /** @class */ (function () {
      function TextureCache(app) {
          this.textures = new Map();
          this.app = app;
      }
      TextureCache.prototype.get = function (key, defaultCallback) {
          var texture = this.textures.get(key);
          if (!texture) {
              var container = defaultCallback();
              var region = container.getLocalBounds(undefined, true);
              var roundedRegion = new PIXI__namespace.Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
              texture = this.app.renderer.generateTexture(container, PIXI__namespace.SCALE_MODES.LINEAR, this.app.renderer.resolution, roundedRegion);
              this.textures.set(key, texture);
          }
          return texture;
      };
      TextureCache.prototype.delete = function (key) {
          var texture = this.textures.get(key);
          if (!texture) {
              return;
          }
          texture.destroy();
          this.textures.delete(key);
      };
      TextureCache.prototype.clear = function () {
          var _this = this;
          Array.from(this.textures.keys()).forEach(function (key) {
              _this.delete(key);
          });
      };
      TextureCache.prototype.destroy = function () {
          this.clear();
      };
      return TextureCache;
  }());

  var colorName = {
  	"aliceblue": [240, 248, 255],
  	"antiquewhite": [250, 235, 215],
  	"aqua": [0, 255, 255],
  	"aquamarine": [127, 255, 212],
  	"azure": [240, 255, 255],
  	"beige": [245, 245, 220],
  	"bisque": [255, 228, 196],
  	"black": [0, 0, 0],
  	"blanchedalmond": [255, 235, 205],
  	"blue": [0, 0, 255],
  	"blueviolet": [138, 43, 226],
  	"brown": [165, 42, 42],
  	"burlywood": [222, 184, 135],
  	"cadetblue": [95, 158, 160],
  	"chartreuse": [127, 255, 0],
  	"chocolate": [210, 105, 30],
  	"coral": [255, 127, 80],
  	"cornflowerblue": [100, 149, 237],
  	"cornsilk": [255, 248, 220],
  	"crimson": [220, 20, 60],
  	"cyan": [0, 255, 255],
  	"darkblue": [0, 0, 139],
  	"darkcyan": [0, 139, 139],
  	"darkgoldenrod": [184, 134, 11],
  	"darkgray": [169, 169, 169],
  	"darkgreen": [0, 100, 0],
  	"darkgrey": [169, 169, 169],
  	"darkkhaki": [189, 183, 107],
  	"darkmagenta": [139, 0, 139],
  	"darkolivegreen": [85, 107, 47],
  	"darkorange": [255, 140, 0],
  	"darkorchid": [153, 50, 204],
  	"darkred": [139, 0, 0],
  	"darksalmon": [233, 150, 122],
  	"darkseagreen": [143, 188, 143],
  	"darkslateblue": [72, 61, 139],
  	"darkslategray": [47, 79, 79],
  	"darkslategrey": [47, 79, 79],
  	"darkturquoise": [0, 206, 209],
  	"darkviolet": [148, 0, 211],
  	"deeppink": [255, 20, 147],
  	"deepskyblue": [0, 191, 255],
  	"dimgray": [105, 105, 105],
  	"dimgrey": [105, 105, 105],
  	"dodgerblue": [30, 144, 255],
  	"firebrick": [178, 34, 34],
  	"floralwhite": [255, 250, 240],
  	"forestgreen": [34, 139, 34],
  	"fuchsia": [255, 0, 255],
  	"gainsboro": [220, 220, 220],
  	"ghostwhite": [248, 248, 255],
  	"gold": [255, 215, 0],
  	"goldenrod": [218, 165, 32],
  	"gray": [128, 128, 128],
  	"green": [0, 128, 0],
  	"greenyellow": [173, 255, 47],
  	"grey": [128, 128, 128],
  	"honeydew": [240, 255, 240],
  	"hotpink": [255, 105, 180],
  	"indianred": [205, 92, 92],
  	"indigo": [75, 0, 130],
  	"ivory": [255, 255, 240],
  	"khaki": [240, 230, 140],
  	"lavender": [230, 230, 250],
  	"lavenderblush": [255, 240, 245],
  	"lawngreen": [124, 252, 0],
  	"lemonchiffon": [255, 250, 205],
  	"lightblue": [173, 216, 230],
  	"lightcoral": [240, 128, 128],
  	"lightcyan": [224, 255, 255],
  	"lightgoldenrodyellow": [250, 250, 210],
  	"lightgray": [211, 211, 211],
  	"lightgreen": [144, 238, 144],
  	"lightgrey": [211, 211, 211],
  	"lightpink": [255, 182, 193],
  	"lightsalmon": [255, 160, 122],
  	"lightseagreen": [32, 178, 170],
  	"lightskyblue": [135, 206, 250],
  	"lightslategray": [119, 136, 153],
  	"lightslategrey": [119, 136, 153],
  	"lightsteelblue": [176, 196, 222],
  	"lightyellow": [255, 255, 224],
  	"lime": [0, 255, 0],
  	"limegreen": [50, 205, 50],
  	"linen": [250, 240, 230],
  	"magenta": [255, 0, 255],
  	"maroon": [128, 0, 0],
  	"mediumaquamarine": [102, 205, 170],
  	"mediumblue": [0, 0, 205],
  	"mediumorchid": [186, 85, 211],
  	"mediumpurple": [147, 112, 219],
  	"mediumseagreen": [60, 179, 113],
  	"mediumslateblue": [123, 104, 238],
  	"mediumspringgreen": [0, 250, 154],
  	"mediumturquoise": [72, 209, 204],
  	"mediumvioletred": [199, 21, 133],
  	"midnightblue": [25, 25, 112],
  	"mintcream": [245, 255, 250],
  	"mistyrose": [255, 228, 225],
  	"moccasin": [255, 228, 181],
  	"navajowhite": [255, 222, 173],
  	"navy": [0, 0, 128],
  	"oldlace": [253, 245, 230],
  	"olive": [128, 128, 0],
  	"olivedrab": [107, 142, 35],
  	"orange": [255, 165, 0],
  	"orangered": [255, 69, 0],
  	"orchid": [218, 112, 214],
  	"palegoldenrod": [238, 232, 170],
  	"palegreen": [152, 251, 152],
  	"paleturquoise": [175, 238, 238],
  	"palevioletred": [219, 112, 147],
  	"papayawhip": [255, 239, 213],
  	"peachpuff": [255, 218, 185],
  	"peru": [205, 133, 63],
  	"pink": [255, 192, 203],
  	"plum": [221, 160, 221],
  	"powderblue": [176, 224, 230],
  	"purple": [128, 0, 128],
  	"rebeccapurple": [102, 51, 153],
  	"red": [255, 0, 0],
  	"rosybrown": [188, 143, 143],
  	"royalblue": [65, 105, 225],
  	"saddlebrown": [139, 69, 19],
  	"salmon": [250, 128, 114],
  	"sandybrown": [244, 164, 96],
  	"seagreen": [46, 139, 87],
  	"seashell": [255, 245, 238],
  	"sienna": [160, 82, 45],
  	"silver": [192, 192, 192],
  	"skyblue": [135, 206, 235],
  	"slateblue": [106, 90, 205],
  	"slategray": [112, 128, 144],
  	"slategrey": [112, 128, 144],
  	"snow": [255, 250, 250],
  	"springgreen": [0, 255, 127],
  	"steelblue": [70, 130, 180],
  	"tan": [210, 180, 140],
  	"teal": [0, 128, 128],
  	"thistle": [216, 191, 216],
  	"tomato": [255, 99, 71],
  	"turquoise": [64, 224, 208],
  	"violet": [238, 130, 238],
  	"wheat": [245, 222, 179],
  	"white": [255, 255, 255],
  	"whitesmoke": [245, 245, 245],
  	"yellow": [255, 255, 0],
  	"yellowgreen": [154, 205, 50]
  };

  /**
   * @module color-parse
   */

  /**
   * Base hues
   * http://dev.w3.org/csswg/css-color/#typedef-named-hue
   */
  //FIXME: use external hue detector
  var baseHues = {
  	red: 0,
  	orange: 60,
  	yellow: 120,
  	green: 180,
  	blue: 240,
  	purple: 300
  };

  /**
   * Parse color from the string passed
   *
   * @return {Object} A space indicator `space`, an array `values` and `alpha`
   */
  function parse (cstr) {
  	var m, parts = [], alpha = 1, space;

  	if (typeof cstr === 'string') {
  		//keyword
  		if (colorName[cstr]) {
  			parts = colorName[cstr].slice();
  			space = 'rgb';
  		}

  		//reserved words
  		else if (cstr === 'transparent') {
  			alpha = 0;
  			space = 'rgb';
  			parts = [0,0,0];
  		}

  		//hex
  		else if (/^#[A-Fa-f0-9]+$/.test(cstr)) {
  			var base = cstr.slice(1);
  			var size = base.length;
  			var isShort = size <= 4;
  			alpha = 1;

  			if (isShort) {
  				parts = [
  					parseInt(base[0] + base[0], 16),
  					parseInt(base[1] + base[1], 16),
  					parseInt(base[2] + base[2], 16)
  				];
  				if (size === 4) {
  					alpha = parseInt(base[3] + base[3], 16) / 255;
  				}
  			}
  			else {
  				parts = [
  					parseInt(base[0] + base[1], 16),
  					parseInt(base[2] + base[3], 16),
  					parseInt(base[4] + base[5], 16)
  				];
  				if (size === 8) {
  					alpha = parseInt(base[6] + base[7], 16) / 255;
  				}
  			}

  			if (!parts[0]) parts[0] = 0;
  			if (!parts[1]) parts[1] = 0;
  			if (!parts[2]) parts[2] = 0;

  			space = 'rgb';
  		}

  		//color space
  		else if (m = /^((?:rgb|hs[lvb]|hwb|cmyk?|xy[zy]|gray|lab|lchu?v?|[ly]uv|lms)a?)\s*\(([^\)]*)\)/.exec(cstr)) {
  			var name = m[1];
  			var isRGB = name === 'rgb';
  			var base = name.replace(/a$/, '');
  			space = base;
  			var size = base === 'cmyk' ? 4 : base === 'gray' ? 1 : 3;
  			parts = m[2].trim()
  				.split(/\s*[,\/]\s*|\s+/)
  				.map(function (x, i) {
  					//<percentage>
  					if (/%$/.test(x)) {
  						//alpha
  						if (i === size)	return parseFloat(x) / 100
  						//rgb
  						if (base === 'rgb') return parseFloat(x) * 255 / 100
  						return parseFloat(x)
  					}
  					//hue
  					else if (base[i] === 'h') {
  						//<deg>
  						if (/deg$/.test(x)) {
  							return parseFloat(x)
  						}
  						//<base-hue>
  						else if (baseHues[x] !== undefined) {
  							return baseHues[x]
  						}
  					}
  					return parseFloat(x)
  				});

  			if (name === base) parts.push(1);
  			alpha = (isRGB) ? 1 : (parts[size] === undefined) ? 1 : parts[size];
  			parts = parts.slice(0, size);
  		}

  		//named channels case
  		else if (cstr.length > 10 && /[0-9](?:\s|\/)/.test(cstr)) {
  			parts = cstr.match(/([0-9]+)/g).map(function (value) {
  				return parseFloat(value)
  			});

  			space = cstr.match(/([a-z])/ig).join('').toLowerCase();
  		}
  	}

  	//numeric case
  	else if (!isNaN(cstr)) {
  		space = 'rgb';
  		parts = [cstr >>> 16, (cstr & 0x00ff00) >>> 8, cstr & 0x0000ff];
  	}

  	//array-like
  	else if (Array.isArray(cstr) || cstr.length) {
  		parts = [cstr[0], cstr[1], cstr[2]];
  		space = 'rgb';
  		alpha = cstr.length === 4 ? cstr[3] : 1;
  	}

  	//object case - detects css cases of rgb and hsl
  	else if (cstr instanceof Object) {
  		if (cstr.r != null || cstr.red != null || cstr.R != null) {
  			space = 'rgb';
  			parts = [
  				cstr.r || cstr.red || cstr.R || 0,
  				cstr.g || cstr.green || cstr.G || 0,
  				cstr.b || cstr.blue || cstr.B || 0
  			];
  		}
  		else {
  			space = 'hsl';
  			parts = [
  				cstr.h || cstr.hue || cstr.H || 0,
  				cstr.s || cstr.saturation || cstr.S || 0,
  				cstr.l || cstr.lightness || cstr.L || cstr.b || cstr.brightness
  			];
  		}

  		alpha = cstr.a || cstr.alpha || cstr.opacity || 1;

  		if (cstr.opacity != null) alpha /= 100;
  	}

  	return {
  		space: space,
  		values: parts,
  		alpha: alpha
  	}
  }

  var hsl = {
  	name: 'hsl',
  	min: [0,0,0],
  	max: [360,100,100],
  	channel: ['hue', 'saturation', 'lightness'],
  	alias: ['HSL'],

  	rgb: function(hsl) {
  		var h = hsl[0] / 360,
  				s = hsl[1] / 100,
  				l = hsl[2] / 100,
  				t1, t2, t3, rgb, val;

  		if (s === 0) {
  			val = l * 255;
  			return [val, val, val];
  		}

  		if (l < 0.5) {
  			t2 = l * (1 + s);
  		}
  		else {
  			t2 = l + s - l * s;
  		}
  		t1 = 2 * l - t2;

  		rgb = [0, 0, 0];
  		for (var i = 0; i < 3; i++) {
  			t3 = h + 1 / 3 * - (i - 1);
  			if (t3 < 0) {
  				t3++;
  			}
  			else if (t3 > 1) {
  				t3--;
  			}

  			if (6 * t3 < 1) {
  				val = t1 + (t2 - t1) * 6 * t3;
  			}
  			else if (2 * t3 < 1) {
  				val = t2;
  			}
  			else if (3 * t3 < 2) {
  				val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
  			}
  			else {
  				val = t1;
  			}

  			rgb[i] = val * 255;
  		}

  		return rgb;
  	}
  };

  /** @module  color-rgba */

  function rgba (color) {
  	// template literals
  	if (Array.isArray(color) && color.raw) color = String.raw(...arguments);

  	var values;

  	//attempt to parse non-array arguments
  	var parsed = parse(color);

  	if (!parsed.space) return []

  	values = Array(3);
  	values[0] = Math.min(Math.max(parsed.values[0], 0), 255);
  	values[1] = Math.min(Math.max(parsed.values[1], 0), 255);
  	values[2] = Math.min(Math.max(parsed.values[2], 0), 255);

  	if (parsed.space[0] === 'h') {
  		values = hsl.rgb(values);
  	}

  	values.push(Math.min(Math.max(parsed.alpha, 0), 1));

  	return values
  }

  function colorToPixi(color) {
      var rgbaColor = rgba(color);
      if (!rgbaColor) {
          throw new Error("Invalid color " + color);
      }
      var pixiColor = PIXI__namespace.utils.rgb2hex([rgbaColor[0] / 255, rgbaColor[1] / 255, rgbaColor[2] / 255]);
      var alpha = rgbaColor[3];
      return [pixiColor, alpha];
  }

  var DELIMETER$1 = '::';
  var WHITE = 0xffffff;
  var NODE_CIRCLE = 'NODE_CIRCLE';
  var NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
  var NODE_ICON = 'NODE_ICON';
  function createNode(nodeGfx) {
      // nodeGfx
      nodeGfx.hitArea = new PIXI__namespace.Circle(0, 0);
      // nodeGfx -> nodeCircle
      var nodeCircle = new PIXI__namespace.Sprite();
      nodeCircle.name = NODE_CIRCLE;
      nodeCircle.anchor.set(0.5);
      nodeGfx.addChild(nodeCircle);
      // nodeGfx -> nodeCircleBorder
      var nodeCircleBorder = new PIXI__namespace.Sprite();
      nodeCircleBorder.name = NODE_CIRCLE_BORDER;
      nodeCircleBorder.anchor.set(0.5);
      nodeGfx.addChild(nodeCircleBorder);
      // nodeGfx -> nodeIcon
      var nodeIcon = new PIXI__namespace.Sprite();
      nodeIcon.name = NODE_ICON;
      nodeIcon.anchor.set(0.5);
      nodeGfx.addChild(nodeIcon);
  }
  function updateNodeStyle(nodeGfx, nodeStyle, textureCache) {
      var _a, _b, _c;
      var nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
      var nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER$1);
      var nodeCircleTexture = textureCache.get(nodeCircleTextureKey, function () {
          var graphics = new PIXI__namespace.Graphics();
          graphics.beginFill(WHITE);
          graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
          return graphics;
      });
      var nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER$1);
      var nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, function () {
          var graphics = new PIXI__namespace.Graphics();
          graphics.lineStyle(nodeStyle.border.width, WHITE);
          graphics.drawCircle(nodeOuterSize, nodeOuterSize, nodeStyle.size);
          return graphics;
      });
      var nodeIconTextureKey = [NODE_ICON, nodeStyle.icon.fontFamily, nodeStyle.icon.fontSize, nodeStyle.icon.content].join(DELIMETER$1);
      var nodeIconTexture = textureCache.get(nodeIconTextureKey, function () {
          var text = textToPixi(nodeStyle.icon.type, nodeStyle.icon.content, {
              fontFamily: nodeStyle.icon.fontFamily,
              fontSize: nodeStyle.icon.fontSize
          });
          return text;
      });
      // nodeGfx
      nodeGfx.hitArea.radius = nodeOuterSize;
      // nodeGfx -> nodeCircle
      var nodeCircle = nodeGfx.getChildByName(NODE_CIRCLE);
      nodeCircle.texture = nodeCircleTexture;
      _a = colorToPixi(nodeStyle.color), nodeCircle.tint = _a[0], nodeCircle.alpha = _a[1];
      // nodeGfx -> nodeCircleBorder
      var nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER);
      nodeCircleBorder.texture = nodeCircleBorderTexture;
      _b = colorToPixi(nodeStyle.border.color), nodeCircleBorder.tint = _b[0], nodeCircleBorder.alpha = _b[1];
      // nodeGfx -> nodeIcon
      var nodeIcon = nodeGfx.getChildByName(NODE_ICON);
      nodeIcon.texture = nodeIconTexture;
      _c = colorToPixi(nodeStyle.icon.color), nodeIcon.tint = _c[0], nodeIcon.alpha = _c[1];
      nodeGfx.addChild(nodeIcon);
  }
  function updateNodeVisibility(nodeGfx, zoomStep) {
      // nodeGfx -> nodeCircleBorder
      var nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER);
      nodeCircleBorder.visible = nodeCircleBorder.visible && zoomStep >= 1;
      // nodeGfx -> nodeIcon
      var nodeIcon = nodeGfx.getChildByName(NODE_ICON);
      nodeIcon.visible = nodeIcon.visible && zoomStep >= 2;
  }

  var DELIMETER = '::';
  var NODE_LABEL_BACKGROUND = 'NODE_LABEL_BACKGROUND';
  var NODE_LABEL_TEXT = 'NODE_LABEL_TEXT';
  function createNodeLabel(nodeLabelGfx) {
      // nodeLabelGfx -> nodeLabelBackground
      var nodeLabelBackground = new PIXI__namespace.Sprite(PIXI__namespace.Texture.WHITE);
      nodeLabelBackground.name = NODE_LABEL_BACKGROUND;
      nodeLabelBackground.anchor.set(0.5);
      nodeLabelGfx.addChild(nodeLabelBackground);
      // nodeLabelGfx -> nodeLabelText
      var nodeLabelText = new PIXI__namespace.Sprite();
      nodeLabelText.name = NODE_LABEL_TEXT;
      nodeLabelText.anchor.set(0.5);
      nodeLabelGfx.addChild(nodeLabelText);
  }
  function updateNodeLabelStyle(nodeLabelGfx, nodeStyle, textureCache) {
      var _a, _b;
      var nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
      var nodeLabelTextTextureKey = [NODE_LABEL_TEXT, nodeStyle.label.fontFamily, nodeStyle.label.fontSize, nodeStyle.label.content].join(DELIMETER);
      var nodeLabelTextTexture = textureCache.get(nodeLabelTextTextureKey, function () {
          var text = textToPixi(nodeStyle.label.type, nodeStyle.label.content, {
              fontFamily: nodeStyle.label.fontFamily,
              fontSize: nodeStyle.label.fontSize
          });
          return text;
      });
      // nodeLabelGfx -> nodeLabelBackground
      var nodeLabelBackground = nodeLabelGfx.getChildByName(NODE_LABEL_BACKGROUND);
      nodeLabelBackground.y = nodeOuterSize + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
      nodeLabelBackground.width = nodeLabelTextTexture.width + nodeStyle.label.padding * 2;
      nodeLabelBackground.height = nodeLabelTextTexture.height + nodeStyle.label.padding * 2;
      _a = colorToPixi(nodeStyle.label.backgroundColor), nodeLabelBackground.tint = _a[0], nodeLabelBackground.alpha = _a[1];
      // nodeLabelGfx -> nodeLabelText
      var nodeLabelText = nodeLabelGfx.getChildByName(NODE_LABEL_TEXT);
      nodeLabelText.texture = nodeLabelTextTexture;
      nodeLabelText.y = nodeOuterSize + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
      _b = colorToPixi(nodeStyle.label.color), nodeLabelText.tint = _b[0], nodeLabelText.alpha = _b[1];
  }
  function updateNodeLabelVisibility(nodeLabelGfx, zoomStep) {
      // nodeLabelGfx -> nodeLabelBackground
      var nodeLabelBackground = nodeLabelGfx.getChildByName(NODE_LABEL_BACKGROUND);
      nodeLabelBackground.visible = nodeLabelBackground.visible && zoomStep >= 3;
      // nodeLabelGfx -> nodeLabelText
      var nodeLabelText = nodeLabelGfx.getChildByName(NODE_LABEL_TEXT);
      nodeLabelText.visible = nodeLabelText.visible && zoomStep >= 3;
  }

  var PixiNode = /** @class */ (function (_super) {
      __extends(PixiNode, _super);
      function PixiNode() {
          var _this = _super.call(this) || this;
          _this.hovered = false;
          _this.nodeGfx = _this.createNode();
          _this.nodeLabelGfx = _this.createNodeLabel();
          _this.nodePlaceholderGfx = new PIXI__namespace.Container();
          _this.nodeLabelPlaceholderGfx = new PIXI__namespace.Container();
          return _this;
      }
      PixiNode.prototype.createNode = function () {
          var _this = this;
          var nodeGfx = new PIXI__namespace.Container();
          nodeGfx.interactive = true;
          nodeGfx.buttonMode = true;
          nodeGfx.on('mousemove', function (event) { return _this.emit('mousemove', event.data.originalEvent); });
          nodeGfx.on('mouseover', function (event) { return _this.emit('mouseover', event.data.originalEvent); });
          nodeGfx.on('mouseout', function (event) { return _this.emit('mouseout', event.data.originalEvent); });
          nodeGfx.on('mousedown', function (event) { return _this.emit('mousedown', event.data.originalEvent); });
          nodeGfx.on('mouseup', function (event) { return _this.emit('mouseup', event.data.originalEvent); });
          createNode(nodeGfx);
          return nodeGfx;
      };
      PixiNode.prototype.createNodeLabel = function () {
          var _this = this;
          var nodeLabelGfx = new PIXI__namespace.Container();
          nodeLabelGfx.interactive = true;
          nodeLabelGfx.buttonMode = true;
          nodeLabelGfx.on('mousemove', function (event) { return _this.emit('mousemove', event.data.originalEvent); });
          nodeLabelGfx.on('mouseover', function (event) { return _this.emit('mouseover', event.data.originalEvent); });
          nodeLabelGfx.on('mouseout', function (event) { return _this.emit('mouseout', event.data.originalEvent); });
          nodeLabelGfx.on('mousedown', function (event) { return _this.emit('mousedown', event.data.originalEvent); });
          nodeLabelGfx.on('mouseup', function (event) { return _this.emit('mouseup', event.data.originalEvent); });
          createNodeLabel(nodeLabelGfx);
          return nodeLabelGfx;
      };
      PixiNode.prototype.updatePosition = function (position) {
          this.nodeGfx.position.copyFrom(position);
          this.nodeLabelGfx.position.copyFrom(position);
      };
      PixiNode.prototype.updateStyle = function (nodeStyle, textureCache) {
          updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
          updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
      };
      PixiNode.prototype.updateVisibility = function (zoomStep) {
          updateNodeVisibility(this.nodeGfx, zoomStep);
          updateNodeLabelVisibility(this.nodeLabelGfx, zoomStep);
      };
      return PixiNode;
  }(lib.TypedEmitter));

  var EDGE_LINE = 'EDGE_LINE';
  function createEdge(edgeGfx) {
      // edgeGfx -> edgeLine
      var edgeLine = new PIXI__namespace.Sprite(PIXI__namespace.Texture.WHITE);
      edgeLine.name = EDGE_LINE;
      edgeLine.anchor.set(0.5);
      edgeGfx.addChild(edgeLine);
  }
  function updateEdgeStyle(edgeGfx, edgeStyle, _textureCache) {
      var _a;
      // edgeGfx -> edgeLine
      var edgeLine = edgeGfx.getChildByName(EDGE_LINE);
      edgeLine.width = edgeStyle.width;
      _a = colorToPixi(edgeStyle.color), edgeLine.tint = _a[0], edgeLine.alpha = _a[1];
  }
  function updateEdgeVisibility(edgeGfx, zoomStep) {
      // edgeGfx -> edgeLine
      var edgeLine = edgeGfx.getChildByName(EDGE_LINE);
      edgeLine.visible = edgeLine.visible && zoomStep >= 1;
  }

  var PixiEdge = /** @class */ (function (_super) {
      __extends(PixiEdge, _super);
      function PixiEdge() {
          var _this = _super.call(this) || this;
          _this.hovered = false;
          _this.edgeGfx = _this.createEdge();
          _this.edgePlaceholderGfx = new PIXI__namespace.Container();
          return _this;
      }
      PixiEdge.prototype.createEdge = function () {
          var _this = this;
          var edgeGfx = new PIXI__namespace.Container();
          edgeGfx.interactive = true;
          edgeGfx.buttonMode = true;
          edgeGfx.on('mousemove', function (event) { return _this.emit('mousemove', event.data.originalEvent); });
          edgeGfx.on('mouseover', function (event) { return _this.emit('mouseover', event.data.originalEvent); });
          edgeGfx.on('mouseout', function (event) { return _this.emit('mouseout', event.data.originalEvent); });
          edgeGfx.on('mousedown', function (event) { return _this.emit('mousedown', event.data.originalEvent); });
          edgeGfx.on('mouseup', function (event) { return _this.emit('mouseup', event.data.originalEvent); });
          createEdge(edgeGfx);
          return edgeGfx;
      };
      PixiEdge.prototype.updatePosition = function (sourceNodePosition, targetNodePosition) {
          var position = { x: (sourceNodePosition.x + targetNodePosition.x) / 2, y: (sourceNodePosition.y + targetNodePosition.y) / 2 };
          var rotation = -Math.atan2(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
          var length = Math.hypot(targetNodePosition.x - sourceNodePosition.x, targetNodePosition.y - sourceNodePosition.y);
          this.edgeGfx.position.copyFrom(position);
          this.edgeGfx.rotation = rotation;
          this.edgeGfx.height = length;
      };
      PixiEdge.prototype.updateStyle = function (edgeStyle, textureCache) {
          updateEdgeStyle(this.edgeGfx, edgeStyle);
      };
      PixiEdge.prototype.updateVisibility = function (zoomStep) {
          updateEdgeVisibility(this.edgeGfx, zoomStep);
      };
      return PixiEdge;
  }(lib.TypedEmitter));

  var DEFAULT_STYLE = {
      node: {
          size: 15,
          color: '#000000',
          border: {
              width: 2,
              color: '#ffffff',
          },
          icon: {
              type: exports.TextType.TEXT,
              fontFamily: 'Arial',
              fontSize: 20,
              color: '#ffffff',
              content: '',
          },
          label: {
              type: exports.TextType.TEXT,
              fontFamily: 'Arial',
              fontSize: 12,
              content: '',
              color: '#333333',
              backgroundColor: 'rgba(0, 0, 0, 0)',
              padding: 4,
          },
      },
      edge: {
          width: 1,
          color: '#cccccc',
      },
  };
  var WORLD_PADDING = 100;
  var PixiGraph = /** @class */ (function (_super) {
      __extends(PixiGraph, _super);
      function PixiGraph(options) {
          var _this = _super.call(this) || this;
          _this.nodeKeyToNodeObject = new Map();
          _this.edgeKeyToEdgeObject = new Map();
          _this.mousedownNodeKey = null;
          _this.mousedownEdgeKey = null;
          _this.onGraphNodeAddedBound = _this.onGraphNodeAdded.bind(_this);
          _this.onGraphEdgeAddedBound = _this.onGraphEdgeAdded.bind(_this);
          _this.onGraphNodeDroppedBound = _this.onGraphNodeDropped.bind(_this);
          _this.onGraphEdgeDroppedBound = _this.onGraphEdgeDropped.bind(_this);
          _this.onGraphClearedBound = _this.onGraphCleared.bind(_this);
          _this.onGraphEdgesClearedBound = _this.onGraphEdgesCleared.bind(_this);
          _this.onGraphNodeAttributesUpdatedBound = _this.onGraphNodeAttributesUpdated.bind(_this);
          _this.onGraphEdgeAttributesUpdatedBound = _this.onGraphEdgeAttributesUpdated.bind(_this);
          _this.onGraphEachNodeAttributesUpdatedBound = _this.onGraphEachNodeAttributesUpdated.bind(_this);
          _this.onGraphEachEdgeAttributesUpdatedBound = _this.onGraphEachEdgeAttributesUpdated.bind(_this);
          _this.onDocumentMouseMoveBound = _this.onDocumentMouseMove.bind(_this);
          _this.onDocumentMouseUpBound = _this.onDocumentMouseUp.bind(_this);
          _this.container = options.container;
          _this.graph = options.graph;
          _this.style = options.style;
          _this.hoverStyle = options.hoverStyle;
          _this.resources = options.resources;
          _this.nodeDragging = typeof options.nodeDragging === 'boolean' ? options.nodeDragging : true;
          PIXI__namespace.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;
          if (!(_this.container instanceof HTMLElement)) {
              throw new Error('container should be a HTMLElement');
          }
          // create PIXI application
          _this.app = new PIXI__namespace.Application({
              resizeTo: _this.container,
              resolution: window.devicePixelRatio,
              transparent: true,
              antialias: true,
              autoDensity: true,
          });
          _this.container.appendChild(_this.app.view);
          _this.app.renderer.plugins.interaction.moveWhenInside = true;
          _this.app.view.addEventListener('wheel', function (event) { event.preventDefault(); });
          _this.textureCache = new TextureCache(_this.app);
          // create PIXI viewport
          _this.viewport = new Viewport({
              screenWidth: _this.container.clientWidth,
              screenHeight: _this.container.clientHeight,
              interaction: _this.app.renderer.plugins.interaction
          })
              .drag()
              .pinch()
              .wheel()
              .decelerate()
              .clampZoom({ maxScale: 1 });
          _this.app.stage.addChild(_this.viewport);
          // create layers
          _this.edgeLayer = new PIXI__namespace.Container();
          _this.frontEdgeLayer = new PIXI__namespace.Container();
          _this.nodeLayer = new PIXI__namespace.Container();
          _this.nodeLabelLayer = new PIXI__namespace.Container();
          _this.frontNodeLayer = new PIXI__namespace.Container();
          _this.frontNodeLabelLayer = new PIXI__namespace.Container();
          _this.viewport.addChild(_this.edgeLayer);
          _this.viewport.addChild(_this.frontEdgeLayer);
          _this.viewport.addChild(_this.nodeLayer);
          _this.viewport.addChild(_this.nodeLabelLayer);
          _this.viewport.addChild(_this.frontNodeLayer);
          _this.viewport.addChild(_this.frontNodeLabelLayer);
          _this.resizeObserver = new ResizeObserver(function () {
              _this.app.resize();
              _this.viewport.resize(_this.container.clientWidth, _this.container.clientHeight);
              _this.updateGraphVisibility();
          });
          // preload resources
          if (_this.resources) {
              _this.app.loader.add(_this.resources);
          }
          _this.app.loader.load(function () {
              _this.viewport.on('frame-end', function () {
                  if (_this.viewport.dirty) {
                      _this.updateGraphVisibility();
                      _this.viewport.dirty = false;
                  }
              });
              _this.resizeObserver.observe(_this.container);
              // listen to graph changes
              _this.graph.on('nodeAdded', _this.onGraphNodeAddedBound);
              _this.graph.on('edgeAdded', _this.onGraphEdgeAddedBound);
              _this.graph.on('nodeDropped', _this.onGraphNodeDroppedBound);
              _this.graph.on('edgeDropped', _this.onGraphEdgeDroppedBound);
              _this.graph.on('cleared', _this.onGraphClearedBound);
              _this.graph.on('edgesCleared', _this.onGraphEdgesClearedBound);
              _this.graph.on('nodeAttributesUpdated', _this.onGraphNodeAttributesUpdatedBound);
              _this.graph.on('edgeAttributesUpdated', _this.onGraphEdgeAttributesUpdatedBound);
              _this.graph.on('eachNodeAttributesUpdated', _this.onGraphEachNodeAttributesUpdatedBound);
              _this.graph.on('eachEdgeAttributesUpdated', _this.onGraphEachEdgeAttributesUpdatedBound);
              // initial draw
              _this.createGraph();
              _this.resetView();
          });
          return _this;
      }
      PixiGraph.prototype.destroy = function () {
          this.graph.off('nodeAdded', this.onGraphNodeAddedBound);
          this.graph.off('edgeAdded', this.onGraphEdgeAddedBound);
          this.graph.off('nodeDropped', this.onGraphNodeDroppedBound);
          this.graph.off('edgeDropped', this.onGraphEdgeDroppedBound);
          this.graph.off('cleared', this.onGraphClearedBound);
          this.graph.off('edgesCleared', this.onGraphEdgesClearedBound);
          this.graph.off('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
          this.graph.off('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
          this.graph.off('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
          this.graph.off('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);
          this.resizeObserver.disconnect();
          this.resizeObserver = undefined;
          this.textureCache.destroy();
          this.textureCache = undefined;
          this.app.destroy(true, { children: true, texture: true, baseTexture: true });
          this.app = undefined;
      };
      Object.defineProperty(PixiGraph.prototype, "zoomStep", {
          get: function () {
              return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
          },
          enumerable: false,
          configurable: true
      });
      PixiGraph.prototype.zoomIn = function () {
          this.viewport.zoom(-this.zoomStep, true);
      };
      PixiGraph.prototype.zoomOut = function () {
          this.viewport.zoom(this.zoomStep, true);
      };
      PixiGraph.prototype.resetView = function () {
          var _this = this;
          var nodesX = this.graph.nodes().map(function (nodeKey) { return _this.graph.getNodeAttribute(nodeKey, 'x'); });
          var nodesY = this.graph.nodes().map(function (nodeKey) { return _this.graph.getNodeAttribute(nodeKey, 'y'); });
          var minX = Math.min.apply(Math, nodesX);
          var maxX = Math.max.apply(Math, nodesX);
          var minY = Math.min.apply(Math, nodesY);
          var maxY = Math.max.apply(Math, nodesY);
          var graphWidth = Math.abs(maxX - minX);
          var graphHeight = Math.abs(maxY - minY);
          var graphCenter = new PIXI__namespace.Point(minX + graphWidth / 2, minY + graphHeight / 2);
          var worldWidth = graphWidth + WORLD_PADDING * 2;
          var worldHeight = graphHeight + WORLD_PADDING * 2;
          // TODO: update worldWidth/worldHeight when graph is updated?
          this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);
          this.viewport.setZoom(1); // otherwise scale is 0 when initialized in React useEffect
          this.viewport.center = graphCenter;
          this.viewport.fit(true);
      };
      PixiGraph.prototype.onGraphNodeAdded = function (data) {
          var nodeKey = data.key;
          var nodeAttributes = data.attributes;
          this.createNode(nodeKey, nodeAttributes);
      };
      PixiGraph.prototype.onGraphEdgeAdded = function (data) {
          var edgeKey = data.key;
          var edgeAttributes = data.attributes;
          var sourceNodeKey = data.source;
          var targetNodeKey = data.target;
          var sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
          var targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
          this.createEdge(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
      };
      PixiGraph.prototype.onGraphNodeDropped = function (data) {
          var nodeKey = data.key;
          this.dropNode(nodeKey);
      };
      PixiGraph.prototype.onGraphEdgeDropped = function (data) {
          var edgeKey = data.key;
          this.dropEdge(edgeKey);
      };
      PixiGraph.prototype.onGraphCleared = function () {
          Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
          Array.from(this.nodeKeyToNodeObject.keys()).forEach(this.dropNode.bind(this));
      };
      PixiGraph.prototype.onGraphEdgesCleared = function () {
          Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
      };
      PixiGraph.prototype.onGraphNodeAttributesUpdated = function (data) {
          var nodeKey = data.key;
          this.updateNodeStyleByKey(nodeKey);
          // TODO: normalize position?
      };
      PixiGraph.prototype.onGraphEdgeAttributesUpdated = function (data) {
          var edgeKey = data.key;
          this.updateEdgeStyleByKey(edgeKey);
      };
      PixiGraph.prototype.onGraphEachNodeAttributesUpdated = function () {
          this.graph.forEachNode(this.updateNodeStyle.bind(this));
      };
      PixiGraph.prototype.onGraphEachEdgeAttributesUpdated = function () {
          this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
      };
      PixiGraph.prototype.hoverNode = function (nodeKey) {
          var node = this.nodeKeyToNodeObject.get(nodeKey);
          if (node.hovered) {
              return;
          }
          // update style
          node.hovered = true;
          this.updateNodeStyleByKey(nodeKey);
          // move to front
          var nodeIndex = this.nodeLayer.getChildIndex(node.nodeGfx);
          this.nodeLayer.removeChildAt(nodeIndex);
          this.nodeLabelLayer.removeChildAt(nodeIndex);
          this.frontNodeLayer.removeChildAt(nodeIndex);
          this.frontNodeLabelLayer.removeChildAt(nodeIndex);
          this.nodeLayer.addChild(node.nodePlaceholderGfx);
          this.nodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
          this.frontNodeLayer.addChild(node.nodeGfx);
          this.frontNodeLabelLayer.addChild(node.nodeLabelGfx);
      };
      PixiGraph.prototype.unhoverNode = function (nodeKey) {
          var node = this.nodeKeyToNodeObject.get(nodeKey);
          if (!node.hovered) {
              return;
          }
          // update style
          node.hovered = false;
          this.updateNodeStyleByKey(nodeKey);
          // move to front
          var nodeIndex = this.frontNodeLayer.getChildIndex(node.nodeGfx);
          this.nodeLayer.removeChildAt(nodeIndex);
          this.nodeLabelLayer.removeChildAt(nodeIndex);
          this.frontNodeLayer.removeChildAt(nodeIndex);
          this.frontNodeLabelLayer.removeChildAt(nodeIndex);
          this.nodeLayer.addChild(node.nodeGfx);
          this.nodeLabelLayer.addChild(node.nodeLabelGfx);
          this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
          this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
      };
      PixiGraph.prototype.hoverEdge = function (edgeKey) {
          var edge = this.edgeKeyToEdgeObject.get(edgeKey);
          if (edge.hovered) {
              return;
          }
          // update style
          edge.hovered = true;
          this.updateEdgeStyleByKey(edgeKey);
          // move to front
          var edgeIndex = this.edgeLayer.getChildIndex(edge.edgeGfx);
          this.edgeLayer.removeChildAt(edgeIndex);
          this.frontEdgeLayer.removeChildAt(edgeIndex);
          this.edgeLayer.addChild(edge.edgePlaceholderGfx);
          this.frontEdgeLayer.addChild(edge.edgeGfx);
      };
      PixiGraph.prototype.unhoverEdge = function (edgeKey) {
          var edge = this.edgeKeyToEdgeObject.get(edgeKey);
          if (!edge.hovered) {
              return;
          }
          // update style
          edge.hovered = false;
          this.updateEdgeStyleByKey(edgeKey);
          // move back
          var edgeIndex = this.frontEdgeLayer.getChildIndex(edge.edgeGfx);
          this.edgeLayer.removeChildAt(edgeIndex);
          this.frontEdgeLayer.removeChildAt(edgeIndex);
          this.edgeLayer.addChild(edge.edgeGfx);
          this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
      };
      PixiGraph.prototype.moveNode = function (nodeKey, point) {
          this.graph.setNodeAttribute(nodeKey, 'x', point.x);
          this.graph.setNodeAttribute(nodeKey, 'y', point.y);
          // update style
          this.updateNodeStyleByKey(nodeKey);
          this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));
      };
      PixiGraph.prototype.enableNodeDragging = function () {
          this.viewport.pause = true; // disable viewport dragging
          document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
      };
      PixiGraph.prototype.onDocumentMouseMove = function (event) {
          var eventPosition = new PIXI__namespace.Point(event.offsetX, event.offsetY);
          var worldPosition = this.viewport.toWorld(eventPosition);
          if (this.mousedownNodeKey) {
              this.moveNode(this.mousedownNodeKey, worldPosition);
          }
      };
      PixiGraph.prototype.onDocumentMouseUp = function () {
          this.viewport.pause = false; // enable viewport dragging
          document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
          this.mousedownNodeKey = null;
          this.mousedownEdgeKey = null;
      };
      PixiGraph.prototype.createGraph = function () {
          this.graph.forEachNode(this.createNode.bind(this));
          this.graph.forEachEdge(this.createEdge.bind(this));
      };
      PixiGraph.prototype.createNode = function (nodeKey, nodeAttributes) {
          var _this = this;
          var node = new PixiNode();
          node.on('mousemove', function (event) {
              _this.emit('nodeMousemove', event, nodeKey);
          });
          node.on('mouseover', function (event) {
              if (!_this.mousedownNodeKey) {
                  _this.hoverNode(nodeKey);
              }
              _this.emit('nodeMouseover', event, nodeKey);
          });
          node.on('mouseout', function (event) {
              if (!_this.mousedownNodeKey) {
                  _this.unhoverNode(nodeKey);
              }
              _this.emit('nodeMouseout', event, nodeKey);
          });
          node.on('mousedown', function (event) {
              _this.mousedownNodeKey = nodeKey;
              if (_this.nodeDragging) {
                  _this.enableNodeDragging();
              }
              document.addEventListener('mouseup', _this.onDocumentMouseUpBound, { once: true });
              _this.emit('nodeMousedown', event, nodeKey);
          });
          node.on('mouseup', function (event) {
              _this.emit('nodeMouseup', event, nodeKey);
              // why native click event doesn't work?
              if (_this.mousedownNodeKey === nodeKey) {
                  _this.emit('nodeClick', event, nodeKey);
              }
          });
          this.nodeLayer.addChild(node.nodeGfx);
          this.nodeLabelLayer.addChild(node.nodeLabelGfx);
          this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
          this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
          this.nodeKeyToNodeObject.set(nodeKey, node);
          this.updateNodeStyle(nodeKey, nodeAttributes);
      };
      PixiGraph.prototype.createEdge = function (edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes) {
          var _this = this;
          var edge = new PixiEdge();
          edge.on('mousemove', function (event) {
              _this.emit('edgeMousemove', event, edgeKey);
          });
          edge.on('mouseover', function (event) {
              _this.hoverEdge(edgeKey);
              _this.emit('edgeMouseover', event, edgeKey);
          });
          edge.on('mouseout', function (event) {
              _this.unhoverEdge(edgeKey);
              _this.emit('edgeMouseout', event, edgeKey);
          });
          edge.on('mousedown', function (event) {
              _this.mousedownEdgeKey = edgeKey;
              _this.emit('edgeMousedown', event, edgeKey);
          });
          edge.on('mouseup', function (event) {
              _this.emit('edgeMouseup', event, edgeKey);
              // why native click event doesn't work?
              if (_this.mousedownEdgeKey === edgeKey) {
                  _this.emit('edgeClick', event, edgeKey);
              }
          });
          this.edgeLayer.addChild(edge.edgeGfx);
          this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
          this.edgeKeyToEdgeObject.set(edgeKey, edge);
          this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
      };
      PixiGraph.prototype.dropNode = function (nodeKey) {
          var node = this.nodeKeyToNodeObject.get(nodeKey);
          this.nodeLayer.removeChild(node.nodeGfx);
          this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
          this.frontNodeLayer.removeChild(node.nodePlaceholderGfx);
          this.frontNodeLabelLayer.removeChild(node.nodeLabelPlaceholderGfx);
          this.nodeKeyToNodeObject.delete(nodeKey);
      };
      PixiGraph.prototype.dropEdge = function (edgeKey) {
          var edge = this.edgeKeyToEdgeObject.get(edgeKey);
          this.edgeLayer.removeChild(edge.edgeGfx);
          this.frontEdgeLayer.removeChild(edge.edgePlaceholderGfx);
          this.edgeKeyToEdgeObject.delete(edgeKey);
      };
      PixiGraph.prototype.updateNodeStyleByKey = function (nodeKey) {
          var nodeAttributes = this.graph.getNodeAttributes(nodeKey);
          this.updateNodeStyle(nodeKey, nodeAttributes);
      };
      PixiGraph.prototype.updateNodeStyle = function (nodeKey, nodeAttributes) {
          var node = this.nodeKeyToNodeObject.get(nodeKey);
          var nodePosition = { x: nodeAttributes.x, y: nodeAttributes.y };
          node.updatePosition(nodePosition);
          var nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, node.hovered ? this.hoverStyle.node : undefined];
          var nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);
          node.updateStyle(nodeStyle, this.textureCache);
      };
      PixiGraph.prototype.updateEdgeStyleByKey = function (edgeKey) {
          var edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
          var sourceNodeKey = this.graph.source(edgeKey);
          var targetNodeKey = this.graph.target(edgeKey);
          var sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
          var targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
          this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
      };
      PixiGraph.prototype.updateEdgeStyle = function (edgeKey, edgeAttributes, _sourceNodeKey, _targetNodeKey, sourceNodeAttributes, targetNodeAttributes) {
          var edge = this.edgeKeyToEdgeObject.get(edgeKey);
          // const sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey)!;
          // const targetNode = this.nodeKeyToNodeObject.get(targetNodeKey)!;
          var sourceNodePosition = { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y };
          var targetNodePosition = { x: targetNodeAttributes.x, y: targetNodeAttributes.y };
          edge.updatePosition(sourceNodePosition, targetNodePosition);
          var edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined];
          var edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);
          edge.updateStyle(edgeStyle, this.textureCache);
      };
      PixiGraph.prototype.updateGraphVisibility = function () {
          var _this = this;
          // culling
          var cull = new Cull();
          cull.addAll(this.viewport.children.map(function (layer) { return layer.children; }).flat());
          cull.cull(this.app.renderer.screen);
          // console.log(
          //   Array.from((cull as any)._targetList as Set<PIXI.DisplayObject>).filter(x => x.visible === true).length,
          //   Array.from((cull as any)._targetList as Set<PIXI.DisplayObject>).filter(x => x.visible === false).length
          // );
          // levels of detail
          var zoom = this.viewport.scale.x;
          var zoomSteps = [0.1, 0.2, 0.4, Infinity];
          var zoomStep = zoomSteps.findIndex(function (zoomStep) { return zoom <= zoomStep; });
          this.graph.forEachNode(function (nodeKey) {
              var node = _this.nodeKeyToNodeObject.get(nodeKey);
              node.updateVisibility(zoomStep);
          });
          this.graph.forEachEdge(function (edgeKey) {
              var edge = _this.edgeKeyToEdgeObject.get(edgeKey);
              edge.updateVisibility(zoomStep);
          });
      };
      return PixiGraph;
  }(lib.TypedEmitter));

  exports.PixiGraph = PixiGraph;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=pixi-graph.umd.js.map
