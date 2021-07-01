import Context from "./Context";

interface HighlightPainter {
  paintHighlight: (context: Context, element: HTMLElement) => void;
}

export default HighlightPainter;
