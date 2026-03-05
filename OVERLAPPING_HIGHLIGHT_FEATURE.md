# Overlapping Highlight Feature

This document describes the new overlapping highlight feature added to the web-marker library.

## Overview

The library now supports three modes for handling overlapping highlights:

1. **"allow"** (default) - Allows overlapping highlights to coexist
2. **"dontCreateNewHighlight"** - Prevents creating a new highlight if it would overlap with existing ones
3. **"deleteOverlappedHighlight"** - Automatically deletes existing highlights that overlap with the new one

## Usage

### Configuration

Pass the `overlappingHighlight` option when creating a `Marker` instance:

```typescript
import Marker from './lib/classes/Marker';

const marker = new Marker({
  rootElement: document.body,
  overlappingHighlight: 'dontCreateNewHighlight', // or 'deleteOverlappedHighlight' or 'allow'
  eventHandler: {
    onHighlightClick: (context, element, e) => {
      console.log('Highlight clicked', context);
    },
    onHighlightDeleted: (context) => {
      // Called when a highlight is automatically deleted due to overlap
      console.log('Highlight deleted', context.serializedRange.uid);
      // Remove from your storage/state here
    }
  }
});
```

### Behavior Details

#### "allow" (default)
- No restrictions on overlapping highlights
- Multiple highlights can exist in the same text region
- This is the original behavior

#### "dontCreateNewHighlight"
- `serializeRange()` returns `null` if the selection overlaps with any existing highlight
- `batchPaint()` throws an error if attempting to paint an overlapping highlight
- No existing highlights are modified
- Useful when you want to prevent users from creating overlapping annotations

#### "deleteOverlappedHighlight"
- Automatically removes any existing highlights that intersect with the new selection
- The `onHighlightDeleted` event handler is called for each deleted highlight
- Allows applications to clean up their state (e.g., remove from localStorage or database)
- Useful when you want the most recent highlight to take precedence

## Implementation Details

### Range Intersection Detection

The feature uses the native DOM `Range.intersectsNode()` API to accurately detect overlaps:

```typescript
private getOverlappingHighlightIds(range: Range): string[] {
  const overlappingIds = new Set<string>();

  if (range.collapsed) {
    return [];
  }

  const elements = Array.from(
    this.document.getElementsByTagName(HighlightTagName)
  );
  for (const el of elements) {
    if (range.intersectsNode(el)) {
      const id = el.getAttribute(AttributeNameHighlightId);
      if (id) {
        overlappingIds.add(id);
      }
    }
  }

  return Array.from(overlappingIds);
}
```

### Event Handler Hook

A new `onHighlightDeleted` hook has been added to the `EventHandler` interface:

```typescript
interface EventHandler {
  onHighlightClick?: (context: Context, element: HTMLElement, e: Event) => void;
  onHighlightHoverStateChange?: (
    context: Context,
    element: HTMLElement,
    hovering: boolean,
    e: Event
  ) => void;
  onHighlightDeleted?: (context: Context) => void;
}
```

This hook is called whenever a highlight is automatically deleted due to the `deleteOverlappedHighlight` mode, allowing applications to:
- Remove the highlight from localStorage
- Delete from a database
- Update UI state
- Log the deletion

## Example: Preventing Overlaps

```typescript
const marker = new Marker({
  rootElement: document.body,
  overlappingHighlight: 'dontCreateNewHighlight',
  eventHandler: {
    onHighlightClick: (context, element) => {
      console.log('Clicked highlight:', context.serializedRange.uid);
    }
  }
});

// Try to create a highlight
const range = window.getSelection().getRangeAt(0);
const serialized = marker.serializeRange(range);

if (!serialized) {
  alert('Cannot create highlight: overlaps with existing highlight');
} else {
  marker.paint(serialized);
  // Save to storage...
}
```

## Example: Auto-Delete Overlaps

```typescript
const highlights = {};

const marker = new Marker({
  rootElement: document.body,
  overlappingHighlight: 'deleteOverlappedHighlight',
  eventHandler: {
    onHighlightDeleted: (context) => {
      // Clean up deleted highlight from storage
      const uid = context.serializedRange.uid;
      delete highlights[uid];
      localStorage.setItem('highlights', JSON.stringify(highlights));
      console.log('Auto-deleted overlapping highlight:', uid);
    }
  }
});

// Create a new highlight - any overlapping ones will be automatically removed
const range = window.getSelection().getRangeAt(0);
const serialized = marker.serializeRange(range);
if (serialized) {
  marker.paint(serialized);
  highlights[serialized.uid] = serialized;
  localStorage.setItem('highlights', JSON.stringify(highlights));
}
```

## Backward Compatibility

The feature is fully backward compatible:
- Default behavior is `"allow"`, which maintains the original functionality
- Existing code will continue to work without any changes
- The `onHighlightDeleted` hook is optional
