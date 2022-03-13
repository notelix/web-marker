import makeid from "../../utils/makeid";
import EventHandler from "./EventHandler";
import HighlightPainter from "./HighlightPainter";
import EventHandlerContext from "./Context";
import Context from "./Context";
import SerializedRange from "./SerializedRange";
import DeserializationError from "./errors/DeserializationError";

const HighlightTagName = "web-marker-highlight";
const HighlightBlacklistedElementClassName = "web-marker-black-listed-element";
const AttributeNameHighlightId = "highlight-id";

const defaultCharsToKeepForTextBeforeAndTextAfter = 128;
const blackListedElementStyle = document.createElement("style");
blackListedElementStyle.innerText = `.${HighlightBlacklistedElementClassName} {display:none!important;};`;

interface MarkerConstructorArgs {
  rootElement?: HTMLElement;
  eventHandler?: EventHandler;
  highlightPainter?: HighlightPainter;
}

const defaultHighlightPainter: HighlightPainter = {
  paintHighlight: (context: Context, element: HTMLElement) => {
    console.log("paintHighlight", context, element);
    element.style.textDecoration = "underline";
    element.style.textDecorationColor = "orange";
  },
};

const defaultEventHandler: EventHandler = {
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
  },
};

class Marker {
  public static normalizeTextCache = {} as any;
  rootElement: Element;
  eventHandler: EventHandler;
  highlightPainter: HighlightPainter;
  state = {
    lastHoverId: "",
    uidToSerializedRange: {} as { [key: string]: SerializedRange },
  };

  constructor({
    rootElement,
    highlightPainter,
    eventHandler,
  }: MarkerConstructorArgs) {
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
    for (let item of Array.from(
      document.getElementsByTagName(HighlightTagName)
    )) {
      if (item.getAttribute(AttributeNameHighlightId) === highlightId) {
        elements.push(item as HTMLElement);
      }
    }
    return elements;
  }

  private static normalizeText(s: string) {
    if (!Marker.normalizeTextCache[s]) {
      Marker.normalizeTextCache[s] = s.replace(/\s/g, "").toLowerCase();
    }
    return Marker.normalizeTextCache[s];
  }

  private static isBlackListedElementNode(element: Node | null) {
    if (!element) {
      return false;
    }
    if (element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const computedStyle = getComputedStyle(element as any);
    if (computedStyle.display === "none") {
      return true;
    }
    if (computedStyle.visibility === "hidden") {
      return true;
    }

    const className = (element as any).className;
    if (
      className &&
      className.indexOf &&
      className.indexOf(HighlightBlacklistedElementClassName) >= 0
    ) {
      return true;
    }

    const tagName = (element as any).tagName;
    return (
      tagName === "STYLE" ||
      tagName === "SCRIPT" ||
      tagName === "TITLE" ||
      tagName === "NOSCRIPT"
    );
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
      element.parentNode?.insertBefore(childNodes[i], element);
    }
    element.parentNode?.removeChild(element);
  }

  private static convertRangeToSelection(range: Range) {
    const selection = window.getSelection() as any;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }

  public serializeRange(
    range: Range,
    options: { uid?: string; charsToKeepForTextBeforeAndTextAfter?: number } = {
      uid: undefined,
      charsToKeepForTextBeforeAndTextAfter:
        defaultCharsToKeepForTextBeforeAndTextAfter,
    }
  ): SerializedRange | null {
    document.head.appendChild(blackListedElementStyle);

    try {
      this.adjustRangeAroundBlackListedElement(range);
      const uid = options?.uid || makeid();
      const charsToKeepForTextBeforeAndTextAfter =
        options?.charsToKeepForTextBeforeAndTextAfter ||
        defaultCharsToKeepForTextBeforeAndTextAfter;
      const selection = Marker.convertRangeToSelection(range);

      let text = selection.toString();
      let textNormalized = Marker.normalizeText(text);
      if (textNormalized) {
        let textBefore = "";
        let textAfter = "";

        {
          // find textBefore
          textBefore =
            textBefore +
            this.getInnerText(range.startContainer).substr(
              0,
              range.startOffset
            );

          let ptr = range.startContainer as Node | null;
          while (textBefore.length < charsToKeepForTextBeforeAndTextAfter) {
            ptr = this.findPreviousTextNodeInDomTree(ptr);
            if (!ptr) {
              // already reached the front
              break;
            }
            textBefore = (ptr as any).textContent + textBefore;
          }
          if (textBefore.length > charsToKeepForTextBeforeAndTextAfter) {
            textBefore = textBefore.substr(
              textBefore.length - charsToKeepForTextBeforeAndTextAfter
            );
          }
        }

        {
          // find textAfter
          textAfter =
            textAfter +
            this.getInnerText(range.endContainer).substr(range.endOffset);

          let ptr = range.endContainer as Node | null;
          while (textAfter.length < charsToKeepForTextBeforeAndTextAfter) {
            ptr = this.findNextTextNodeInDomTree(ptr);
            if (!ptr) {
              // already reached the end
              break;
            }
            textAfter = textAfter + (ptr as any).textContent;
          }

          if (textAfter.length > charsToKeepForTextBeforeAndTextAfter) {
            textAfter = textAfter.substr(
              0,
              charsToKeepForTextBeforeAndTextAfter
            );
          }
        }

        this.state.uidToSerializedRange[uid] = {
          uid,
          textBefore,
          text,
          textAfter,
        };
        return this.state.uidToSerializedRange[uid];
      }

      return null;
    } finally {
      document.head.removeChild(blackListedElementStyle);
    }
  }

  public batchPaint(serializedRanges: SerializedRange[]) {
    const results = {} as any;
    const errors = {} as any;
    const {results: deserializedRanges, errors: deserializedRangeErrors} = this.batchDeserializeRange(serializedRanges);

    for (let i = 0; i < serializedRanges.length; i++) {
      if (deserializedRangeErrors[i]) {
        errors[i] = deserializedRangeErrors[i];
        continue;
      }

      const uid = serializedRanges[i].uid;
      const range = deserializedRanges[i];

      if (!range.collapsed) {
        const setElementHighlightIdAttribute = (element: HTMLElement) => {
          element.setAttribute(AttributeNameHighlightId, uid);
        };

        new Promise((resolve) => {
          if (range.startContainer === range.endContainer) {
            if (range.startOffset === range.endOffset) {
              resolve(null);
              return;
            }
            // special case
            const word = (<Text>range.startContainer).splitText(
                range.startOffset
            );
            word.splitText(range.endOffset);
            setElementHighlightIdAttribute(
                this.convertTextNodeToHighlightElement(word)
            );

            resolve(null);
            return;
          }

          const toPaint = [];
          let ptr = (<Text>range.startContainer).splitText(
              range.startOffset
          ) as Node | null;
          toPaint.push(ptr);

          while (true) {
            ptr = this.findNextTextNodeInDomTree(ptr);
            if (ptr === range.endContainer) {
              break;
            }
            toPaint.push(ptr);
          }

          (<Text>range.endContainer).splitText(range.endOffset);
          toPaint.push(range.endContainer);

          toPaint.forEach((item) => {
            if (item) {
              let decoratedElement = this.convertTextNodeToHighlightElement(item);
              setElementHighlightIdAttribute(decoratedElement);

              if (!decoratedElement.innerText) {
                decoratedElement.parentElement?.insertBefore(
                    item,
                    decoratedElement.nextSibling
                );
                decoratedElement.parentElement?.removeChild(decoratedElement);
              }
            }
          });

          resolve(null);
          return;
        }).then(() => {
          this.paintHighlights(uid);
        });
      }
      results[i] = {range};
    }

    return {results, errors};
  }

  public paint(serializedRange: SerializedRange) {
    if (!serializedRange) {
      return;
    }
    const {results, errors} = this.batchPaint([serializedRange]);
    if (errors[0]) {
      throw errors[0];
    }
    return results[0];
  }

  public unpaint(serializedRange: SerializedRange) {
    const id = serializedRange.uid;

    for (let element of Marker.resolveHighlightElements(id)) {
      Marker.unpaintElement(element);
    }
  }

  private batchDeserializeRange(serializedRanges: SerializedRange[]) {
    document.head.appendChild(blackListedElementStyle);
    const results = {} as any;
    const errors = {} as any;
    const rootText = this.getNormalizedInnerText(this.rootElement);

    for (let i = 0; i < serializedRanges.length; i++) {
      try {
        this.state.uidToSerializedRange[serializedRanges[i].uid] = serializedRanges[i];
        const offset = this.resolveSerializedRangeOffsetInText(
            rootText,
            serializedRanges[i]
        );
        const start = this.findElementAtOffset(this.rootElement, offset);
        const end = this.findElementAtOffset(
            this.rootElement,
            offset + Marker.normalizeText(serializedRanges[i].text).length
        );
        const range = document.createRange();
        range.setStart(
            start.element,
            Marker.getRealOffset(start.element, start.offset)
        );
        range.setEnd(end.element, Marker.getRealOffset(end.element, end.offset));
        this.trimRangeSpaces(range);
        results[i] = range;
      } catch (ex) {
        errors[i] = ex;
      }
    }

    document.head.removeChild(blackListedElementStyle);
    return {results, errors}
  }

  public deserializeRange(serializedRange: SerializedRange) {
    const {results, errors} = this.batchDeserializeRange([serializedRange]);
    if (errors[0]) {
      throw errors[0];
    }
    return results[0];
  }

  clickListener = (e: Event) => {
    if (!e.target || !(e.target instanceof HTMLElement)) {
      return;
    }

    const target = e.target as HTMLElement;
    const id = target.getAttribute(AttributeNameHighlightId);
    if (id && this.eventHandler.onHighlightClick) {
      this.eventHandler.onHighlightClick(this.buildContext(id), target, e);
    }
  };

  mouseoverListener = (e: Event) => {
    if (!e.target || !(e.target instanceof HTMLElement)) {
      return;
    }

    const target = e.target as HTMLElement;
    let newHoverId = target?.getAttribute(AttributeNameHighlightId);
    if (this.state.lastHoverId === newHoverId) {
      return;
    }
    const oldHoverId = this.state.lastHoverId;
    this.state.lastHoverId = newHoverId as string;

    if (newHoverId) {
      this.highlightHovering(newHoverId, true, e);
    }
    if (oldHoverId) {
      this.highlightHovering(oldHoverId, false, e);
    }
  };

  public addEventListeners() {
    this.rootElement.addEventListener("click", this.clickListener, true);
    this.rootElement.addEventListener(
      "mouseover",
      this.mouseoverListener,
      true
    );
  }

  public removeEventListeners() {
    this.rootElement.removeEventListener("click", this.clickListener, true);
    this.rootElement.removeEventListener(
      "mouseover",
      this.mouseoverListener,
      true
    );
  }

  public paintHighlights(highlightId: string) {
    let context = this.buildContext(highlightId);
    if (this.highlightPainter.beforePaintHighlight) {
      this.highlightPainter.beforePaintHighlight(context);
    }
    for (let element of Marker.resolveHighlightElements(highlightId)) {
      this.highlightPainter.paintHighlight(
          context,
          element
      );
    }
    if (this.highlightPainter.afterPaintHighlight) {
      this.highlightPainter.afterPaintHighlight(context);
    }
  }

  private highlightHovering(highlightId: string, hovering: boolean, e: Event) {
    for (let element of Marker.resolveHighlightElements(highlightId)) {
      if (this.eventHandler.onHighlightHoverStateChange) {
        this.eventHandler.onHighlightHoverStateChange(
          this.buildContext(highlightId),
          element as any,
          hovering,
          e
        );
      }
    }
  }

  private getInnerText(element: Node) {
    if (Marker.isBlackListedElementNode(element)) {
      return "";
    }
    if (element.nodeType === Node.TEXT_NODE) {
      return element.textContent;
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
          continue;
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
          continue;
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
        const candidate = this.findLastChildTextNode(
          ptr?.previousSibling || null
        );
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
        if (Marker.isBlackListedElementNode(ptr?.nextSibling)) {
          ptr = ptr.nextSibling;
          continue;
        }
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

  private forwardOffset(
    { element, offset }: { element: Node; offset: number },
    toMove: number
  ): { element: Node; offset: number } {
    const elementText = this.getNormalizedInnerText(element);
    if (elementText.length > toMove + offset) {
      offset += toMove;
      return { element, offset };
    } else {
      let nextTextNode = this.findNextTextNodeInDomTree(element);
      if (nextTextNode) {
        return this.forwardOffset(
          {
            element: nextTextNode,
            offset: 0,
          },
          toMove - (elementText.length - offset)
        );
      } else {
        offset = this.getInnerText(element);
        return { element, offset };
      }
    }
  }

  private backwardOffset(
    { element, offset }: { element: Node; offset: number },
    toMove: number
  ): { element: Node; offset: number } {
    if (offset >= toMove) {
      offset -= toMove;
      return { element, offset };
    } else {
      const previousTextNode = this.findPreviousTextNodeInDomTree(element);
      if (previousTextNode) {
        return this.backwardOffset(
          {
            element: previousTextNode,
            offset: this.getNormalizedInnerText(previousTextNode).length,
          },
          toMove - offset
        );
      } else {
        offset = 0;
        return { element, offset };
      }
    }
  }

  private findElementAtOffset(
    root: Node,
    offset: number
  ): { element: Node; offset: number } {
    if (root.nodeType === Node.TEXT_NODE) {
      return { element: root as Text, offset: offset };
    } else {
      let cumulativeOffset = 0;
      for (let i = 0; i < root.childNodes.length; i++) {
        if (Marker.isBlackListedElementNode(root.childNodes[i])) {
          continue;
        }
        const childSize = this.getNormalizedInnerText(
          root.childNodes[i]
        ).length;
        cumulativeOffset += childSize;
        if (cumulativeOffset < offset) {
          continue;
        }
        return this.findElementAtOffset(
          root.childNodes[i],
          offset - (cumulativeOffset - childSize)
        );
      }
      throw new Error("failed to findElementAtOffset");
    }
  }

  private trimRangeSpaces(range: Range) {
    let start = this.getInnerText(range.startContainer).substr(
      range.startOffset
    );
    let startTrimmed = start.trimStart();
    range.setStart(
      range.startContainer,
      range.startOffset + (start.length - startTrimmed.length)
    );

    let end = this.getInnerText(range.endContainer).substr(0, range.endOffset);
    let endTrimmed = end.trimEnd();
    range.setEnd(
      range.endContainer,
      range.endOffset - (end.length - endTrimmed.length)
    );
  }

  private convertTextNodeToHighlightElement(word: Node) {
    const decoratedElement = document.createElement(HighlightTagName);
    word.parentElement?.insertBefore(decoratedElement, word.nextSibling);
    word.parentElement?.removeChild(word);
    decoratedElement.appendChild(word);
    return decoratedElement;
  }

  private buildContext(highlightId: string): EventHandlerContext {
    return {
      serializedRange: this.state.uidToSerializedRange[highlightId],
      marker: this,
    };
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
    if (
      blacklistedParentOfStartContainer &&
      blacklistedParentOfEndContainer &&
      blacklistedParentOfStartContainer === blacklistedParentOfEndContainer
    ) {
      throw new Error("cannot highlight blacklisted element");
    }

    if (blacklistedParentOfStartContainer) {
      range.setStart(
        this.findNextTextNodeInDomTree(
          blacklistedParentOfStartContainer
        ) as any,
        0
      );
    }
    if (blacklistedParentOfEndContainer) {
      let prevNode = this.findPreviousTextNodeInDomTree(
        blacklistedParentOfEndContainer
      ) as any;
      range.setEnd(prevNode, this.getInnerText(prevNode).length);
    }
  }

  public getSerializedRangeFromUid(uid: string): SerializedRange | null {
    return this.state.uidToSerializedRange[uid] || null;
  }

  resolveSerializedRangeOffsetInText(
    text: any,
    serializedRange: SerializedRange
  ): number {
    // TODO: optimize algorithm, maybe use https://github.com/google/diff-match-patch
    const textBeforeNormalized = Marker.normalizeText(
      serializedRange.textBefore
    );
    const textAfterNormalized = Marker.normalizeText(serializedRange.textAfter);
    const textNormalized = Marker.normalizeText(serializedRange.text);

    for (let strategy of resolveSerializedRangeOffsetInTextStrategies) {
      const textToSearch =
        (strategy.textBefore ? textBeforeNormalized : "") +
        textNormalized +
        (strategy.textAfter ? textAfterNormalized : "");

      const index = text.indexOf(textToSearch);
      if (index >= 0) {
        return index + (strategy.textBefore ? textBeforeNormalized.length : 0);
      }
    }

    throw new DeserializationError(`failed to deserialize range`);
  }
}

const resolveSerializedRangeOffsetInTextStrategies = [
  {
    textBefore: true,
    textAfter: true,
  },
  {
    textBefore: false,
    textAfter: true,
  },
  {
    textBefore: true,
    textAfter: false,
  },
  {
    textBefore: false,
    textAfter: false,
  },
];

export default Marker;
export type { MarkerConstructorArgs };
