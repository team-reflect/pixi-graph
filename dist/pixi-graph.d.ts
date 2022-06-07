import * as Graphology from 'graphology-types';
import { Attributes } from 'graphology-types';
import * as ResourceLoader from 'resource-loader';
import { TypedEmitter } from 'tiny-typed-emitter';

declare enum TextType {
    TEXT = "TEXT",
    BITMAP_TEXT = "BITMAP_TEXT"
}
interface TextStyle {
    fontFamily: string;
    fontSize: number;
}

declare type BaseAttributes = Attributes;
declare type BaseNodeAttributes = BaseAttributes & {
    x: number;
    y: number;
};
declare type BaseEdgeAttributes = BaseAttributes;

interface GraphStyle {
    node: {
        size: number;
        color: string;
        border: {
            width: number;
            color: string;
        };
        icon: {
            content: string;
            type: TextType;
            fontFamily: string;
            fontSize: number;
            color: string;
        };
        label: {
            content: string;
            type: TextType;
            fontFamily: string;
            fontSize: number;
            color: string;
            backgroundColor: string;
            padding: number;
        };
    };
    edge: {
        width: number;
        color: string;
    };
}
declare type NodeStyle = GraphStyle['node'];
declare type EdgeStyle = GraphStyle['edge'];
declare type StyleDefinition<Style, Attributes> = ((attributes: Attributes) => Style) | {
    [Key in keyof Style]?: StyleDefinition<Style[Key], Attributes>;
} | Style;
declare type NodeStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes> = StyleDefinition<NodeStyle, NodeAttributes>;
declare type EdgeStyleDefinition<EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> = StyleDefinition<EdgeStyle, EdgeAttributes>;
interface GraphStyleDefinition<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
    node?: NodeStyleDefinition<NodeAttributes>;
    edge?: EdgeStyleDefinition<EdgeAttributes>;
}

interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
    container: HTMLElement;
    graph: Graphology.AbstractGraph<NodeAttributes, EdgeAttributes>;
    style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
    hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
    resources?: ResourceLoader.IAddOptions[];
    nodeDragging?: boolean;
}
interface PixiGraphEvents {
    nodeClick: (event: MouseEvent, nodeKey: string) => void;
    nodeMousemove: (event: MouseEvent, nodeKey: string) => void;
    nodeMouseover: (event: MouseEvent, nodeKey: string) => void;
    nodeMouseout: (event: MouseEvent, nodeKey: string) => void;
    nodeMousedown: (event: MouseEvent, nodeKey: string) => void;
    nodeMouseup: (event: MouseEvent, nodeKey: string) => void;
    edgeClick: (event: MouseEvent, edgeKey: string) => void;
    edgeMousemove: (event: MouseEvent, edgeKey: string) => void;
    edgeMouseover: (event: MouseEvent, edgeKey: string) => void;
    edgeMouseout: (event: MouseEvent, edgeKey: string) => void;
    edgeMousedown: (event: MouseEvent, edgeKey: string) => void;
    edgeMouseup: (event: MouseEvent, edgeKey: string) => void;
}
declare class PixiGraph<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> extends TypedEmitter<PixiGraphEvents> {
    container: HTMLElement;
    graph: Graphology.AbstractGraph<NodeAttributes, EdgeAttributes>;
    style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
    hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
    resources?: ResourceLoader.IAddOptions[];
    nodeDragging: boolean;
    private app;
    private textureCache;
    private viewport;
    private resizeObserver;
    private edgeLayer;
    private frontEdgeLayer;
    private nodeLayer;
    private nodeLabelLayer;
    private frontNodeLayer;
    private frontNodeLabelLayer;
    private nodeKeyToNodeObject;
    private edgeKeyToEdgeObject;
    private mousedownNodeKey;
    private mousedownEdgeKey;
    private onGraphNodeAddedBound;
    private onGraphEdgeAddedBound;
    private onGraphNodeDroppedBound;
    private onGraphEdgeDroppedBound;
    private onGraphClearedBound;
    private onGraphEdgesClearedBound;
    private onGraphNodeAttributesUpdatedBound;
    private onGraphEdgeAttributesUpdatedBound;
    private onGraphEachNodeAttributesUpdatedBound;
    private onGraphEachEdgeAttributesUpdatedBound;
    private onDocumentMouseMoveBound;
    private onDocumentMouseUpBound;
    constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>);
    destroy(): void;
    private get zoomStep();
    zoomIn(): void;
    zoomOut(): void;
    resetView(): void;
    private onGraphNodeAdded;
    private onGraphEdgeAdded;
    private onGraphNodeDropped;
    private onGraphEdgeDropped;
    private onGraphCleared;
    private onGraphEdgesCleared;
    private onGraphNodeAttributesUpdated;
    private onGraphEdgeAttributesUpdated;
    private onGraphEachNodeAttributesUpdated;
    private onGraphEachEdgeAttributesUpdated;
    private hoverNode;
    private unhoverNode;
    private hoverEdge;
    private unhoverEdge;
    private moveNode;
    private enableNodeDragging;
    private onDocumentMouseMove;
    private onDocumentMouseUp;
    private createGraph;
    private createNode;
    private createEdge;
    private dropNode;
    private dropEdge;
    private updateNodeStyleByKey;
    private updateNodeStyle;
    private updateEdgeStyleByKey;
    private updateEdgeStyle;
    private updateGraphVisibility;
}

export { EdgeStyle, EdgeStyleDefinition, GraphOptions, GraphStyle, GraphStyleDefinition, NodeStyle, NodeStyleDefinition, PixiGraph, StyleDefinition, TextStyle, TextType };
