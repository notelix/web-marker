import Marker, { MarkerConstructorArgs } from "./lib/classes/Marker";
import DeserializationError, {
  isDeserializationError,
} from "./lib/classes/errors/DeserializationError";
import SerializedRange from "./lib/classes/SerializedRange";
import Context from "./lib/classes/Context";
import EventHandler from "./lib/classes/EventHandler";
import HighlightPainter from "./lib/classes/HighlightPainter";

const Errors = {
  isDeserializationError,
};

export { Marker };
export { Errors };

export type {
  Context,
  EventHandler,
  HighlightPainter,
  SerializedRange,
  MarkerConstructorArgs,
  DeserializationError,
};
