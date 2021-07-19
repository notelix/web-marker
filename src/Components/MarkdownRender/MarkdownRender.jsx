import React from "react";
import ReactDOM from "react-dom";
import Markdown from "markdown-to-jsx";
import makeMarkdownOverrides from "./overrides";
import "./MarkdownRender.scss";
import TextareaAutosize from "@material-ui/core/TextareaAutosize";
import Button from "@material-ui/core/Button";
import { parseMarkdown } from "../../utils/markdown";
import Marker from "../../lib/classes/Marker";
import showDialog from "../../utils/showDialog";
import makeid from "../../utils/makeid";

const demoMultiRangeMode = window.location.hash.indexOf("multi-range") >= 0;

const LOCALSTORAGE_HIGHLIGHTS_KEY = "web-marker-highlights";

class AnnotationDialog extends React.Component {
  static DialogTitle = "Annotation";
  state = { text: this.props.text || "" };

  DialogButtons = ({ closeDialog }) => [
    <Button
      onClick={() => closeDialog(this.state.text)}
      variant="contained"
      key={"ok"}
    >
      OK
    </Button>,
  ];

  render() {
    return (
      <div className="annotation-root">
        <TextareaAutosize
          placeholder="Write something…"
          value={this.state.text}
          onChange={(e) => {
            this.setState({ text: e.target.value });
          }}
        />
      </div>
    );
  }
}

function findProperTopLeftAndWidth(clientRect) {
  if (!clientRect) {
    return [0, 0];
  }
  let top = clientRect.top - 35;
  if (top - window.scrollY < 0) {
    top = window.scrollY;
  }
  let width = Math.min(clientRect.width, window.innerWidth);
  width = Math.max(width, 300);
  let left = clientRect.left + clientRect.width / 2 - width / 2;
  if (left < 10) {
    left = 10;
  }
  if (left + width > window.innerWidth - 10) {
    left += window.innerWidth - 10 - (left + width);
  }
  return [top, left, width];
}

class MarkdownRender extends React.Component {
  highlights = {};
  mapHighlightIdToRange = {};
  selectedHighlightId = null;

  state = { userSelection: {}, hideHighlightButtons: true };

  loadHighlightsFromLocalStorage() {
    const data = JSON.parse(localStorage[LOCALSTORAGE_HIGHLIGHTS_KEY]);
    Object.keys(data).forEach((key) => {
      data[key].uid = key;
    });
    return data;
  }

  saveHighlightsToLocalStorage() {
    if (demoMultiRangeMode) {
      return;
    }
    const toSave = {};
    Object.keys(this.highlights).forEach((key) => {
      toSave[key] = { ...this.highlights[key], id: undefined };
    });
    localStorage[LOCALSTORAGE_HIGHLIGHTS_KEY] = JSON.stringify(toSave);
  }

  marker = new Marker({
    rootElement: document.body,
    eventHandler: {
      onHighlightClick: (context, element) => {
        if (demoMultiRangeMode) {
          // click again to delete in multi range mode
          this.marker.unpaint(this.highlights[context.serializedRange.uid]);
          delete this.highlights[context.serializedRange.uid];
        } else {
          this.selectedHighlightId = context.serializedRange.uid;
          this.setUserSelectionByRange(
            this.mapHighlightIdToRange[this.selectedHighlightId]
          );
        }
      },
      onHighlightHoverStateChange: (context, element, hovering) => {
        if (hovering) {
          element.style.backgroundColor = "#EEEEEE";
        } else {
          context.marker.highlightPainter.paintHighlight(context, element);
        }
      },
    },
    highlightPainter: {
      paintHighlight: (context, element) => {
        element.style.textDecoration = "underline";
        element.style.textDecorationColor = "#f6b80b";
        if (context.serializedRange.annotation) {
          element.style.backgroundColor = "rgba(246,184,11, 0.3)";
        } else {
          element.style.backgroundColor = "initial";
        }
      },
    },
  });

  paint(serializedRange) {
    const { range } = this.marker.paint(serializedRange);
    this.highlights[serializedRange.uid] = serializedRange;
    this.mapHighlightIdToRange[serializedRange.uid] = range;
    this.saveHighlightsToLocalStorage();
  }

  setUserSelectionByRange(range) {
    let pos = range.getBoundingClientRect();

    let calculatedPos = {
      top: pos.top + window.scrollY,
      left: pos.left + window.scrollX,
      width: pos.width,
      height: pos.height,
    };
    if (calculatedPos.width === 0) {
      calculatedPos.width = 400;
      calculatedPos.top = window.pointerPos.y - 10;
      calculatedPos.left = window.pointerPos.x - 200;
    }
    this.setState({
      userSelection: {
        range,
        clientRect: calculatedPos,
      },
      hideHighlightButtons: false,
    });
  }

  mouseMoveListener = (e) => {
    const { pageX, pageY } = e;
    window.pointerPos = { x: pageX, y: pageY };
  };
  mouseupListener = (e) => {
    this.handleMouseUp(e, false);
  };

  handleMouseUp = (e, calledRecursively = false) => {
    try {
      const selection = window.getSelection();
      if (!selection.toString() && !demoMultiRangeMode) {
        this.setState({ hideHighlightButtons: true });
        return;
      }
      if (!selection.rangeCount) {
        return null;
      }
      this.selectedHighlightId = null;
      let range = selection.getRangeAt(0);
      this.setUserSelectionByRange(range);
      if (demoMultiRangeMode) {
        const serialized = this.marker.serializeRange(
          this.state.userSelection.range
        );
        if (!serialized) {
          return;
        }
        this.paint(serialized);
      }
    } finally {
      if (demoMultiRangeMode) {
        const selection = window.getSelection();
        if (selection.isCollapsed && !this.isHighlightElement(e.target)) {
          selection.modify("move", "forward", "character");
          selection.modify("extend", "backward", "word");
          selection.modify("move", "backward", "character");
          selection.modify("extend", "forward", "word");
          if (!calledRecursively) {
            this.handleMouseUp(e, true);
          }
        }
        setTimeout(() => {
          this.setState({
            hideHighlightButtons: Object.keys(this.highlights).length === 0,
          });
        });
      }
    }
  };

  componentDidMount() {
    if (!demoMultiRangeMode && localStorage[LOCALSTORAGE_HIGHLIGHTS_KEY]) {
      this.highlights = this.loadHighlightsFromLocalStorage();
      Object.keys(this.highlights).forEach((id) => {
        this.paint(this.highlights[id]);
      });
    }

    document.addEventListener("mouseup", this.mouseupListener);
    window.addEventListener("pointermove", this.mouseMoveListener);
    this.marker.addEventListeners();
  }

  componentWillUnmount() {
    document.removeEventListener("mouseup", this.mouseupListener);
    window.removeEventListener("pointermove", this.mouseMoveListener);
    this.marker.removeEventListeners();
  }

  render() {
    let markdown = parseMarkdown(this.props.markdown);

    const [top, left, width] = findProperTopLeftAndWidth(
      (this.state.userSelection || {}).clientRect
    );
    return (
      <div className="markdown-render-root">
        {!!this.state.userSelection &&
          !this.state.hideHighlightButtons &&
          ReactDOM.createPortal(
            <div
              className="highlight-button-wrapper web-marker-black-listed-element"
              style={{
                left: `${left}px`,
                width: `${width}px`,
                top: top + "px",
              }}
            >
              <div className="highlight-buttons">
                {this.renderHighlightButtons()}
              </div>
            </div>,
            document.body
          )}

        <div className="content-wrapper">
          <span>abc</span>
          <span className="web-marker-black-listed-element">
            bl<span>ackli</span>sted
          </span>
          <span>vcxdsf</span>
          <span>qwerthgf</span>

          <Content
            options={{ overrides: makeMarkdownOverrides(this.props) }}
            {...this.props}
          >
            {markdown.content}
          </Content>
        </div>
      </div>
    );
  }

  renderHighlightButtons() {
    if (demoMultiRangeMode) {
      return this.renderHighlightButtonsMultiRangeMode();
    } else {
      return this.renderHighlightButtonsDefault();
    }
  }

  renderHighlightButtonsDefault() {
    const doHighlight = () => {
      const serialized = this.marker.serializeRange(
        this.state.userSelection.range
      );
      if (!serialized) {
        return;
      }

      this.paint(serialized);

      this.setState({ hideHighlightButtons: true });
      return { uid: serialized.uid };
    };

    const doDelete = () => {
      if (this.highlights[this.selectedHighlightId].annotation) {
        // eslint-disable-next-line no-restricted-globals
        if (!confirm("Are you sure? The annotation will be removed as well")) {
          return;
        }
      }
      this.marker.unpaint(this.highlights[this.selectedHighlightId]);
      delete this.highlights[this.selectedHighlightId];
      this.saveHighlightsToLocalStorage();
      this.setState({ hideHighlightButtons: true });
    };

    const doAnnotate = () => {
      if (!this.selectedHighlightId) {
        const result = doHighlight();
        this.selectedHighlightId = result.uid;
      }
      let selectedHighlightId = this.selectedHighlightId;
      showDialog(AnnotationDialog, {
        text: this.highlights[selectedHighlightId].annotation || "",
      }).then((data) => {
        this.highlights[selectedHighlightId].annotation = data;
        this.saveHighlightsToLocalStorage();
        this.marker.paintHighlights(selectedHighlightId);
      });
    };

    return (
      <>
        {!this.selectedHighlightId && (
          <div onMouseDown={doHighlight} className="highlight-button">
            <span>Highlight</span>
          </div>
        )}
        {!!this.selectedHighlightId && (
          <div onMouseDown={doDelete} className="highlight-button del-button">
            <span>Delete</span>
          </div>
        )}
        <div onMouseDown={doAnnotate} className="highlight-button">
          <span>Annotate</span>
        </div>
      </>
    );
  }

  renderHighlightButtonsMultiRangeMode() {
    const onSubmit = () => {
      const data = { id: makeid(), ranges: [] };
      Object.keys(this.highlights).forEach((key) => {
        data.ranges.push(this.highlights[key]);
      });
      alert("selection created: " + JSON.stringify(data, null, 4));
      onDiscard();
    };
    const onDiscard = () => {
      Object.keys(this.highlights).forEach((key) => {
        this.marker.unpaint(this.highlights[key]);
        delete this.highlights[key];
      });
      this.setState({
        hideHighlightButtons: true,
      });
    };
    return (
      <>
        <div className="highlight-button" onMouseDown={onSubmit}>
          <span>Submit</span>
        </div>
        <div className="highlight-button" onMouseDown={onDiscard}>
          <span>Discard</span>
        </div>
      </>
    );
  }

  isHighlightElement(element) {
    try {
      return element.tagName === "HIGHLIGHT";
    } catch {
      return false;
    }
  }
}

class Content extends React.Component {
  shouldComponentUpdate(nextProps, nextState, nextContext) {
    return nextProps.markdown !== this.props.markdown;
  }

  render() {
    return (
      <Markdown options={{ overrides: makeMarkdownOverrides(this.props) }}>
        {this.props.children}
      </Markdown>
    );
  }
}

export default MarkdownRender;
