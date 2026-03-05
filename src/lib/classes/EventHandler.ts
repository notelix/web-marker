import Context from "./Context";

interface EventHandler {
  onHighlightClick?: (context: Context, element: HTMLElement, e: Event) => void;
  onHighlightHoverStateChange?: (
    context: Context,
    element: HTMLElement,
    hovering: boolean,
    e: Event
  ) => void;
  onHighlightDeleted?: (context: Context) => void;
}

export default EventHandler;
