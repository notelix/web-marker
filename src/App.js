import "./index.css";
import React from "react";
// eslint-disable-next-line import/no-webpack-loader-syntax
import testMd from "!raw-loader!./test.md";
import MarkdownRender from "./Components/MarkdownRender/MarkdownRender";


class App extends React.Component {
    render() {
        return (<MarkdownRender markdown={testMd}/>)
    }
}

export default App;
