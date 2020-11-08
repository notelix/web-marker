import React from "react";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

import { isArray } from "lodash-es";

function getChildren(props) {
  if (typeof props.children === "string") {
    return props.children;
  }
  if (isArray(props.children)) {
    return props.children[0];
  }
  return props.children;
}

const Math = (props) => {
  if (props.kind === "block") {
    return <BlockMath math={getChildren(props)} />;
  } else {
    return <InlineMath math={getChildren(props)} />;
  }
};

export default Math;
