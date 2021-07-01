import SerializedRange from "./SerializedRange";
import Marker from "./Marker";

interface Context {
  id: string;
  serializedRange: SerializedRange;
  marker: Marker;
}

export default Context;
