import {v4 as uuid} from "uuid";
import EventHandler from "./EventHandler";
import HighlightPainter from "./HighlightPainter";
import EventHandlerContext from "./Context";
import Context from "./Context";
import SerializedRange from "./SerializedRange";

const HighlightTagName = "web-marker-highlight";
const HighlightBlacklistedElementClassName = "web-marker-black-listed-element";
const AttributeNameHighlightId = "highlight-id";
const CharsToKeepForPrecedingAndSucceeding = 8;

const blackListedElementStyle = document.createElement("style");
blackListedElementStyle.innerText = `.${HighlightBlacklistedElementClassName} {display:none;};`

interface MarkerConstructorArgs {
    rootElement?: HTMLElement
    eventHandler?: EventHandler
    highlightPainter?: HighlightPainter
}

const defaultHighlightPainter: HighlightPainter = ({
    paintHighlight: (context: Context, element: HTMLElement) => {
        console.log("paintHighlight", context, element);
        element.style.textDecoration = "underline";
        element.style.textDecorationColor = "orange";
    }
})

const defaultEventHandler: EventHandler = ({
    onHighlightClick: (context, element) => {
        console.log("onHighlightClick", context, element);
    },
    onHighlightHoverStateChange: (context, element, hovering) => {
        console.log("onHighlightHoverStateChange", context, element);
        if (hovering) {
            element.style.backgroundColor = "#FFE49C";
        } else {
            element.style.backgroundColor = "";
        }
    }
})

class Marker {
    rootElement: Element
    eventHandler: EventHandler
    highlightPainter: HighlightPainter

    state = {
        lastHoverId: "",
        idToSerializedRange: {} as { [key: string]: SerializedRange }
    }

    constructor({rootElement, highlightPainter, eventHandler}: MarkerConstructorArgs) {
        this.rootElement = rootElement || document.body;
        this.highlightPainter = highlightPainter || defaultHighlightPainter;
        this.eventHandler = eventHandler || defaultEventHandler;
    }

    public static clearSelection() {
        const selection = window.getSelection();
        if (!selection) {
            return;
        }
        if (selection.empty) {
            selection.empty();
        } else if (selection.removeAllRanges) {
            selection.removeAllRanges();
        }
    }

    private static resolveHighlightElements(highlightId: string): HTMLElement[] {
        let elements: HTMLElement[] = [];
        for (let item of Array.from(document.getElementsByTagName(HighlightTagName))) {
            if (item.getAttribute(AttributeNameHighlightId) === highlightId) {
                elements.push(item as HTMLElement);
            }
        }
        return elements;
    }

    private static normalizeText(s: string) {
        return s.replace(/\s/g, '').toLowerCase();
    }

    private static isBlackListedElementNode(element: Node | null) {
        if (!element) {
            return false;
        }
        if (element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if (getComputedStyle(element as any).display === "none") {
            return true;
        }

        const className = (element as any).className;
        if (className && className.indexOf && className.indexOf(HighlightBlacklistedElementClassName) >= 0) {
            return true;
        }

        const tagName = (element as any).tagName;
        return tagName === "STYLE" || tagName === "SCRIPT" || tagName === "TITLE" || tagName === "NOSCRIPT";

    }

    private static getRealOffset(textNode: Node, normalizedOffset: number) {
        const s = textNode.textContent || "";
        let cumulative = 0;
        for (let i = 0; i < s.length; i++) {
            while (i < s.length && !Marker.normalizeText(s.substr(i, 1))) {
                // omit whitespaces
                i++;
            }
            if (cumulative === normalizedOffset) {
                return i;
            }
            cumulative++;
        }
        if (cumulative === normalizedOffset) {
            return s.length;
        }
        throw new Error("failed to get real offset");
    }

    private static unpaintElement(element: HTMLElement) {
        let childNodes = Array.from(element.childNodes);
        for (let i = 0; i < childNodes.length; i++) {
            element.parentNode?.insertBefore(childNodes[i], element)
        }
        element.parentNode?.removeChild(element);
    }

    private static convertRangeToSelection(range: Range) {
        const selection = window.getSelection() as any;
        selection.removeAllRanges();
        selection.addRange(range);
        return selection;
    }

    public serializeRange(range: Range): SerializedRange | null {
        document.head.appendChild(blackListedElementStyle);

        try {
            this.adjustRangeAroundBlackListedElement(range);
            return this._serializeRange(range);
        } finally {
            document.head.removeChild(blackListedElementStyle);
        }
    }

    public paint(serializedRange: SerializedRange) {
        if (!serializedRange) {
            return;
        }
        const id = serializedRange.id;
        const range = this.deserializeRange(serializedRange);
        this.paintRange(range, {id});
        Marker.clearSelection();
        return ({range});
    }

    public unpaint(serializedRange: SerializedRange) {
        const id = serializedRange.id;

        for (let element of Marker.resolveHighlightElements(id)) {
            Marker.unpaintElement(element);
        }
    }

    public deserializeRange(serializedRange: SerializedRange) {
        document.head.appendChild(blackListedElementStyle);
        try {
            return this._deserializeRange(serializedRange);
        } finally {
            document.head.removeChild(blackListedElementStyle);
        }
    }

    public paintRange(range: Range, {id}: { id: string }) {
        if (range.collapsed) {
            return;
        }

        const execute = (element: HTMLElement) => {
            element.setAttribute(AttributeNameHighlightId, id);
        }

        new Promise(resolve => {
            if (range.startContainer === range.endContainer) {
                // special case
                const word = (<Text>range.startContainer).splitText(range.startOffset);
                word.splitText(range.endOffset)
                execute(this.convertTextNodeToHighlightElement(word));

                resolve(null);
                return;
            }

            const toPaint = [];
            let ptr = (<Text>range.startContainer).splitText(range.startOffset) as Node | null
            toPaint.push(ptr);

            while (true) {
                ptr = this.findNextTextNodeInDomTree(ptr);
                if (ptr === range.endContainer) {
                    break;
                }
                toPaint.push(ptr);
            }

            (<Text>range.endContainer).splitText(range.endOffset)
            toPaint.push(range.endContainer);

            toPaint.forEach(item => {
                if (item) {
                    execute(this.convertTextNodeToHighlightElement(item))
                }
            })

            resolve(null);
            return;
        }).then(() => {
            this.paintHighlights(id);
        });
    }

    clickListener = (e: Event) => {
        const id = (<HTMLElement>e.target)?.getAttribute(AttributeNameHighlightId);
        if (id && this.eventHandler.onHighlightClick) {
            this.eventHandler.onHighlightClick(this.buildContext(id), <HTMLElement>e.target)
        }
    };

    mouseoverListener = (e: Event) => {
        let newHoverId = (<HTMLElement>e.target)?.getAttribute(AttributeNameHighlightId);
        if (this.state.lastHoverId === newHoverId) {
            return;
        }
        const oldHoverId = this.state.lastHoverId;
        this.state.lastHoverId = newHoverId as string;

        if (newHoverId) {
            this.highlightHovering(newHoverId, true);
        }
        if (oldHoverId) {
            this.highlightHovering(oldHoverId, false);
        }
    };

    public addEventListeners() {
        this.rootElement.addEventListener('click', this.clickListener);
        this.rootElement.addEventListener('mouseover', this.mouseoverListener)
    }

    public removeEventListeners() {
        this.rootElement.removeEventListener('click', this.clickListener);
        this.rootElement.removeEventListener('mouseover', this.mouseoverListener)
    }

    public paintHighlights(highlightId: string) {
        for (let element of Marker.resolveHighlightElements(highlightId)) {
            this.highlightPainter.paintHighlight(this.buildContext(highlightId), element);
        }
    }

    private _deserializeRange(serializedRange: SerializedRange) {
        this.state.idToSerializedRange[serializedRange.id] = serializedRange;
        const rootText = this.getNormalizedInnerText(this.rootElement)
        const targetOffset = rootText.indexOf(serializedRange.preceding + serializedRange.selected + serializedRange.succeeding);
        if (targetOffset < 0) {
            throw new Error("failed to deserialize");
        }

        let start = this.findElementAtOffset(this.rootElement, targetOffset);
        start = this.forwardOffset(start, serializedRange.preceding.length);
        let end = this.findElementAtOffset(this.rootElement, targetOffset + (serializedRange.preceding + serializedRange.selected + serializedRange.succeeding).length);
        end = this.backwardOffset(end, serializedRange.succeeding.length);

        const range = document.createRange();
        range.setStart(start.element, Marker.getRealOffset(start.element, start.offset));
        range.setEnd(end.element, Marker.getRealOffset(end.element, end.offset));
        this.trimRangeSpaces(range);
        return range;
    }

    private _serializeRange(range: Range): SerializedRange | null {
        const id = uuid();
        const selection = Marker.convertRangeToSelection(range);

        let selected = Marker.normalizeText(selection.toString());
        if (!selected) {
            return null;
        }

        let preceding = "";
        let succeeding = "";

        { // find preceding
            preceding = preceding + Marker.normalizeText(this.getInnerText(range.startContainer).substr(0, range.startOffset));

            let ptr = range.startContainer as Node | null;
            while (preceding.length < CharsToKeepForPrecedingAndSucceeding) {
                ptr = this.findPreviousTextNodeInDomTree(ptr);
                if (!ptr) {
                    // already reached the front
                    break;
                }
                preceding = Marker.normalizeText((ptr as any).textContent) + preceding;
            }
            if (preceding.length > CharsToKeepForPrecedingAndSucceeding) {
                preceding = preceding.substr(preceding.length - CharsToKeepForPrecedingAndSucceeding);
            }
        }

        { // find succeeding
            succeeding = succeeding + Marker.normalizeText(this.getInnerText(range.endContainer).substr(range.endOffset));

            let ptr = range.endContainer as Node | null;
            while (succeeding.length < CharsToKeepForPrecedingAndSucceeding) {
                ptr = this.findNextTextNodeInDomTree(ptr);
                if (!ptr) {
                    // already reached the end
                    break;
                }
                succeeding = succeeding + Marker.normalizeText((ptr as any).textContent);
            }

            if (succeeding.length > CharsToKeepForPrecedingAndSucceeding) {
                succeeding = succeeding.substr(0, CharsToKeepForPrecedingAndSucceeding);
            }
        }

        this.state.idToSerializedRange[id] = {id, preceding, selected, succeeding}
        return this.state.idToSerializedRange[id];
    }

    private highlightHovering(highlightId: string, hovering: boolean) {
        for (let element of Marker.resolveHighlightElements(highlightId)) {
            this.eventHandler.onHighlightHoverStateChange(this.buildContext(highlightId), element as any, hovering)
        }
    }

    private getInnerText(element: Node) {
        if (Marker.isBlackListedElementNode(element)) {
            return "";
        }
        if (element.nodeType === Node.TEXT_NODE) {
            return element.textContent
        } else {
            if (typeof (element as any).innerText === "undefined") {
                let result = "";
                for (let i = 0; i < element.childNodes.length; i++) {
                    result += this.getInnerText(element.childNodes[i]);
                }
                return result;
            } else {
                return (element as any).innerText;
            }
        }
    }

    private getNormalizedInnerText(element: Node) {
        return Marker.normalizeText(this.getInnerText(element));
    }

    private findLastChildTextNode(node: Node | null): Node | null {
        if (!node) {
            return null;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            return node;
        }
        if (node.childNodes) {
            for (let i = node.childNodes.length - 1; i >= 0; i--) {
                if (Marker.isBlackListedElementNode(node.childNodes[i])) {
                    continue
                }
                const candidate = this.findLastChildTextNode(node.childNodes[i]);
                if (candidate !== null) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private findFirstChildTextNode(node: Node): Node | null {
        if (node.nodeType === Node.TEXT_NODE) {
            return node;
        }
        if (node.childNodes) {
            for (let i = 0; i < node.childNodes.length; i++) {
                if (Marker.isBlackListedElementNode(node.childNodes[i])) {
                    continue
                }
                const candidate = this.findFirstChildTextNode(node.childNodes[i]);
                if (candidate !== null) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private findPreviousTextNodeInDomTree(ptr: Node | null) {
        while (ptr) {
            while (Marker.isBlackListedElementNode(ptr?.previousSibling || null)) {
                ptr = ptr?.previousSibling || null;
            }
            while (ptr?.previousSibling) {
                const candidate = this.findLastChildTextNode(ptr?.previousSibling || null);
                if (candidate) {
                    return candidate;
                }
                ptr = ptr.previousSibling;
            }

            ptr = ptr?.parentElement || null;
        }
        return null;
    }

    private findNextTextNodeInDomTree(ptr: Node | null) {
        while (ptr) {
            while (Marker.isBlackListedElementNode(ptr?.nextSibling || null)) {
                ptr = ptr?.nextSibling || null;
            }
            while (ptr?.nextSibling) {
                const candidate = this.findFirstChildTextNode(ptr.nextSibling);
                if (candidate) {
                    return candidate;
                }
                ptr = ptr.nextSibling;
            }

            ptr = ptr?.parentElement || null;
        }
        return null;
    }

    private forwardOffset({
                              element,
                              offset
                          }: { element: Node, offset: number }, toMove: number): { element: Node, offset: number } {
        const elementText = this.getNormalizedInnerText(element)
        if (elementText.length > toMove + offset) {
            offset += toMove
            return {element, offset}
        } else {
            let nextTextNode = this.findNextTextNodeInDomTree(element);
            if (nextTextNode) {
                return this.forwardOffset({
                    element: nextTextNode,
                    offset: 0
                }, toMove - (elementText.length - offset))
            } else {
                offset = this.getInnerText(element)
                return {element, offset}
            }
        }
    }

    private backwardOffset({
                               element,
                               offset
                           }: { element: Node, offset: number }, toMove: number): { element: Node, offset: number } {
        if (offset >= toMove) {
            offset -= toMove;
            return {element, offset}
        } else {
            const previousTextNode = this.findPreviousTextNodeInDomTree(element);
            if (previousTextNode) {
                return this.backwardOffset({
                    element: previousTextNode,
                    offset: this.getNormalizedInnerText(previousTextNode).length
                }, toMove - offset)
            } else {
                offset = 0;
                return {element, offset}
            }
        }
    }

    private findElementAtOffset(root: Node, offset: number): { element: Node, offset: number } {
        if (root.nodeType === Node.TEXT_NODE) {
            return ({element: root as Text, offset: offset});
        } else {
            let cumulativeOffset = 0;
            for (let i = 0; i < root.childNodes.length; i++) {
                if (Marker.isBlackListedElementNode(root.childNodes[i])) {
                    continue;
                }
                const childSize = this.getNormalizedInnerText(root.childNodes[i]).length;
                cumulativeOffset += childSize;
                if (cumulativeOffset < offset) {
                    continue;
                }
                return this.findElementAtOffset(root.childNodes[i], offset - (cumulativeOffset - childSize));
            }
            throw new Error("failed to findElementAtOffset")
        }
    }

    private trimRangeSpaces(range: Range) {
        let start = this.getInnerText(range.startContainer).substr(range.startOffset);
        let startTrimmed = start.trimStart();
        range.setStart(range.startContainer, range.startOffset + (start.length - startTrimmed.length));

        let end = this.getInnerText(range.endContainer).substr(0, range.endOffset);
        let endTrimmed = end.trimEnd();
        range.setEnd(range.endContainer, range.endOffset - (end.length - endTrimmed.length));
    }

    private convertTextNodeToHighlightElement(word: Node) {
        const decoratedElement = document.createElement(HighlightTagName);
        decoratedElement.innerHTML = this.getInnerText(word);
        word.parentElement?.insertBefore(decoratedElement, word.nextSibling);
        word.parentElement?.removeChild(word);
        return decoratedElement;
    }

    private buildContext(highlightId: string): EventHandlerContext {
        return {id: highlightId, serializedRange: this.state.idToSerializedRange[highlightId], marker: this};
    }

    private adjustRangeAroundBlackListedElement(range: Range) {
        let ptr = range.startContainer;
        let blacklistedParentOfStartContainer = null;
        while (ptr) {
            if (Marker.isBlackListedElementNode(ptr)) {
                blacklistedParentOfStartContainer = ptr;
            }
            ptr = ptr.parentElement as any;
        }

        ptr = range.endContainer;
        let blacklistedParentOfEndContainer = null;
        while (ptr) {
            if (Marker.isBlackListedElementNode(ptr)) {
                blacklistedParentOfEndContainer = ptr;
            }
            ptr = ptr.parentElement as any;
        }
        if (blacklistedParentOfStartContainer && blacklistedParentOfEndContainer && blacklistedParentOfStartContainer === blacklistedParentOfEndContainer) {
            throw new Error("cannot highlight blacklisted element");
        }

        if (blacklistedParentOfStartContainer) {
            range.setStart(this.findNextTextNodeInDomTree(blacklistedParentOfStartContainer) as any, 0);
        }
        if (blacklistedParentOfEndContainer) {
            let prevNode = this.findPreviousTextNodeInDomTree(blacklistedParentOfEndContainer) as any;
            range.setEnd(prevNode, this.getInnerText(prevNode).length);
        }
    }
}

export default Marker;