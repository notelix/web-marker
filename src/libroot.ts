import Marker from "./lib/classes/Marker";
import DeserializationError, {
  isDeserializationError,
} from "./lib/classes/errors/DeserializationError";

export default {
  Marker: Marker,
  Errors: {
    DeserializationError,
    isDeserializationError,
  },
};
