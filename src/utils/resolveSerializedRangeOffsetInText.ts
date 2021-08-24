import SerializedRange from "../lib/classes/SerializedRange";
import DeserializationError from "../lib/classes/errors/DeserializationError";

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

export default function resolveSerializedRangeOffsetInText(
  text: any,
  serializedRange: SerializedRange
): number {
  // TODO: optimize algorithm, maybe use https://github.com/google/diff-match-patch
  for (let strategy of resolveSerializedRangeOffsetInTextStrategies) {
    const textToSearch =
      (strategy.textBefore ? serializedRange.textBefore : "") +
      serializedRange.text +
      (strategy.textAfter ? serializedRange.textAfter : "");

    const index = text.indexOf(textToSearch);
    if (index >= 0) {
      return (
        index + (strategy.textBefore ? serializedRange.textBefore.length : 0)
      );
    }
  }

  throw new DeserializationError();
}
