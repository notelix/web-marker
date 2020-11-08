import React from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import docco from "react-syntax-highlighter/dist/esm/styles/hljs/docco";
import Math from "../math";

SyntaxHighlighter.registerLanguage("javascript", js);

const Pre = (props) => {
  function getLang(props) {
    if (!!props.className && props.className.startsWith("lang-")) {
      return props.className.replace("lang-", "");
    }
    return "";
  }

  if (props.children.type === "code") {
    const childProps = props.children.props;
    let lang = getLang(childProps);
    if (lang === "math") {
      return <Math {...childProps} kind={"block"} />;
    }

    return (
      <SyntaxHighlighter language={getLang(childProps)} style={docco}>
        {childProps.children}
      </SyntaxHighlighter>
    );
  }

  return <div>ERROR</div>;
};

export default Pre;
