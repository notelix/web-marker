# web-marker

![logo](https://raw.githubusercontent.com/notelix/web-marker/develop/public/logo.svg)

A web page highlighter that features
* accurate serialization and deserialization which makes it possible to correctly restore the highlights, even if part of the web page has changed
* nested highlighting
* no dependency

# How to run
```bash
git clone https://github.com/notelix/web-marker
cd web-marker
npm i
npm start
```

# How to use
```
npm install @notelix/web-marker
```

```javascript
import {Marker} from "@notelix/web-marker"

const marker = new Marker({
    rootElement: document.body,
    eventHandler: {
        onHighlightClick: (context, element) => {
            marker.unpaint(context.serializedRange);
        },
        onHighlightHoverStateChange: (context, element, hovering) => {
            if (hovering) {
                element.style.backgroundColor = "#f0d8ff";
            } else {
                element.style.backgroundColor = "";
            }
        }
    },
    highlightPainter: {
        paintHighlight: (context, element) => {
            element.style.color = "red";
        }
    }
});

marker.addEventListeners();

document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
        return null;
    }
    const serialized = marker.serializeRange(selection.getRangeAt(0));
    console.log(JSON.stringify(serialized));
    marker.paint(serialized);
})
```

# How to build library
```
npm run build-lib
npm pack
```

# Build with web-marker

* [notelix/notelix](https://github.com/notelix/notelix): An open source web note taking / highlighter software
