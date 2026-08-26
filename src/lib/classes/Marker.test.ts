export {};

describe("Marker", () => {
  it("can be imported without a global browser document", () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      global,
      "document",
    );
    Object.defineProperty(global, "document", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(() => {
        jest.isolateModules(() => require("../../libroot"));
      }).not.toThrow();
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(global, "document", documentDescriptor);
      }
    }
  });

  it("uses the owner document and window of an iframe root", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDocument = iframe.contentDocument as Document;
    const root = iframeDocument.createElement("main");
    iframeDocument.body.appendChild(root);

    const Marker = require("./Marker").default;
    const marker = new Marker({ rootElement: root });

    expect(marker.document).toBe(iframeDocument);
    expect(marker.window).toBe(iframe.contentWindow);
  });

  it("serializes, paints, and removes a highlight without leaking styles", () => {
    document.body.innerHTML = '<main id="root">Hello world</main>';
    const root = document.getElementById("root") as HTMLElement;
    const text = root.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);

    const Marker = require("./Marker").default;
    const marker = new Marker({ rootElement: root });
    const serialized = marker.serializeRange(range, { uid: "greeting" });

    expect(serialized).toEqual({
      uid: "greeting",
      text: "Hello",
      textBefore: "",
      textAfter: " world",
    });
    expect(document.head.querySelectorAll("style")).toHaveLength(0);

    marker.paint(serialized);
    expect(
      root.querySelectorAll('web-marker-highlight[highlight-id="greeting"]'),
    ).toHaveLength(1);

    marker.unpaint(serialized);
    expect(root.querySelector("web-marker-highlight")).toBeNull();
    expect(root.textContent).toBe("Hello world");
    expect(marker.getSerializedRangeFromUid("greeting")).toBeNull();
  });

  it("serializes text that matches an object prototype property", () => {
    document.body.innerHTML = '<main id="root">__proto__</main>';
    const root = document.getElementById("root") as HTMLElement;
    const text = root.firstChild as Text;
    const range = document.createRange();
    range.selectNodeContents(text);

    const Marker = require("./Marker").default;
    const marker = new Marker({ rootElement: root });

    expect(marker.serializeRange(range, { uid: "prototype-text" })).toEqual({
      uid: "prototype-text",
      text: "__proto__",
      textBefore: "",
      textAfter: "",
    });
  });
});
