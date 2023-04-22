import React from "react";
// @ts-ignore
// eslint-disable-next-line import/no-webpack-loader-syntax
import testMd from "!raw-loader!./test.md";
import MarkdownRender from "./Components/MarkdownRender/MarkdownRender";
import IframeRender from "./Components/MarkdownRender/IframeRender";

class App extends React.Component {
  private isIframe: boolean;

  constructor(props: any) {
    super(props)
    const urlSearchParams = new URLSearchParams(window.location.search.slice(1));
    this.isIframe = urlSearchParams.has('iframe');
  }

  render() {
    return this.isIframe
      ? <IframeRender markdown={testMd} />
      : <MarkdownRender markdown={testMd} />;
  }
}

export default App;
