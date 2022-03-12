import Context from "./Context";

interface HighlightPainter {
  paintHighlight: (context: Context, element: HTMLElement) => void;
  beforePaintHighlight?: (context: Context) => void;
  afterPaintHighlight?: (context: Context) => void;
}

export default HighlightPainter;
