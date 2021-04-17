import * as PIXI from 'pixi.js';
import { __extends } from 'tslib';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import { TypedEmitter } from 'tiny-typed-emitter';
import deepmerge from 'deepmerge';
import rgba from 'color-rgba';

var WHITE$1 = 0xffffff;
var TextType;
(function (TextType) {
    TextType["TEXT"] = "TEXT";
    TextType["BITMAP_TEXT"] = "BITMAP_TEXT";
    // TODO: SDF_TEXT
    // see https://github.com/PixelsCommander/pixi-sdf-text/issues/12
})(TextType || (TextType = {}));
function textToPixi(type, content, style) {
    var text;
    if (type === TextType.TEXT) {
        // TODO: convert to bitmap font with PIXI.BitmapFont.from?
        text = new PIXI.Text(content, {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fill: WHITE$1
        });
    }
    else if (type === TextType.BITMAP_TEXT) {
        text = new PIXI.BitmapText(content, {
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
    var style = deepmerge.all(styles);
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
            var roundedRegion = new PIXI.Rectangle(Math.floor(region.x), Math.floor(region.y), Math.ceil(region.width), Math.ceil(region.height));
            texture = this.app.renderer.generateTexture(container, PIXI.SCALE_MODES.LINEAR, this.app.renderer.resolution, roundedRegion);
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

function colorToPixi(color) {
    var rgbaColor = rgba(color);
    if (!rgbaColor) {
        throw new Error("Invalid color " + color);
    }
    var pixiColor = PIXI.utils.rgb2hex([rgbaColor[0] / 255, rgbaColor[1] / 255, rgbaColor[2] / 255]);
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
    nodeGfx.hitArea = new PIXI.Circle(0, 0);
    // nodeGfx -> nodeCircle
    var nodeCircle = new PIXI.Sprite();
    nodeCircle.name = NODE_CIRCLE;
    nodeCircle.anchor.set(0.5);
    nodeGfx.addChild(nodeCircle);
    // nodeGfx -> nodeCircleBorder
    var nodeCircleBorder = new PIXI.Sprite();
    nodeCircleBorder.name = NODE_CIRCLE_BORDER;
    nodeCircleBorder.anchor.set(0.5);
    nodeGfx.addChild(nodeCircleBorder);
    // nodeGfx -> nodeIcon
    var nodeIcon = new PIXI.Sprite();
    nodeIcon.name = NODE_ICON;
    nodeIcon.anchor.set(0.5);
    nodeGfx.addChild(nodeIcon);
}
function updateNodeStyle(nodeGfx, nodeStyle, textureCache) {
    var _a, _b, _c;
    var nodeOuterSize = nodeStyle.size + nodeStyle.border.width;
    var nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER$1);
    var nodeCircleTexture = textureCache.get(nodeCircleTextureKey, function () {
        var graphics = new PIXI.Graphics();
        graphics.beginFill(WHITE);
        graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
        return graphics;
    });
    var nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER$1);
    var nodeCircleBorderTexture = textureCache.get(nodeCircleBorderTextureKey, function () {
        var graphics = new PIXI.Graphics();
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
    var nodeLabelBackground = new PIXI.Sprite(PIXI.Texture.WHITE);
    nodeLabelBackground.name = NODE_LABEL_BACKGROUND;
    nodeLabelBackground.anchor.set(0.5);
    nodeLabelGfx.addChild(nodeLabelBackground);
    // nodeLabelGfx -> nodeLabelText
    var nodeLabelText = new PIXI.Sprite();
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
        _this.nodePlaceholderGfx = new PIXI.Container();
        _this.nodeLabelPlaceholderGfx = new PIXI.Container();
        return _this;
    }
    PixiNode.prototype.createNode = function () {
        var _this = this;
        var nodeGfx = new PIXI.Container();
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
        var nodeLabelGfx = new PIXI.Container();
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
}(TypedEmitter));

var EDGE_LINE = 'EDGE_LINE';
function createEdge(edgeGfx) {
    // edgeGfx -> edgeLine
    var edgeLine = new PIXI.Sprite(PIXI.Texture.WHITE);
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
        _this.edgePlaceholderGfx = new PIXI.Container();
        return _this;
    }
    PixiEdge.prototype.createEdge = function () {
        var _this = this;
        var edgeGfx = new PIXI.Container();
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
}(TypedEmitter));

var DEFAULT_STYLE = {
    node: {
        size: 15,
        color: '#000000',
        border: {
            width: 2,
            color: '#ffffff',
        },
        icon: {
            type: TextType.TEXT,
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#ffffff',
            content: '',
        },
        label: {
            type: TextType.TEXT,
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
        PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;
        if (!(_this.container instanceof HTMLElement)) {
            throw new Error('container should be a HTMLElement');
        }
        // create PIXI application
        _this.app = new PIXI.Application({
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
        _this.edgeLayer = new PIXI.Container();
        _this.frontEdgeLayer = new PIXI.Container();
        _this.nodeLayer = new PIXI.Container();
        _this.nodeLabelLayer = new PIXI.Container();
        _this.frontNodeLayer = new PIXI.Container();
        _this.frontNodeLabelLayer = new PIXI.Container();
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
        var graphCenter = new PIXI.Point(minX + graphWidth / 2, minY + graphHeight / 2);
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
        document.addEventListener('mouseup', this.onDocumentMouseUpBound, { once: true });
    };
    PixiGraph.prototype.onDocumentMouseMove = function (event) {
        var eventPosition = new PIXI.Point(event.offsetX, event.offsetY);
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
            _this.enableNodeDragging();
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
}(TypedEmitter));

export { PixiGraph, TextType };
//# sourceMappingURL=pixi-graph.esm.js.map
