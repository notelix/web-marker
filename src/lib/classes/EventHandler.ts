import Context from "./Context";

interface EventHandler {
  onHighlightClick: (context: Context, element: HTMLElement) => void;
  onHighlightHoverStateChange: (
    context: Context,
    element: HTMLElement,
    hovering: boolean
  ) => void;
}

export default EventHandler;
