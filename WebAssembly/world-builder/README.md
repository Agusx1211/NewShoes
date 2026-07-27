# Original World Builder browser port

This target ports the Zero Hour application in
`GeneralsMD/Code/Tools/WorldBuilder`. The original C++ document, views, editor
tools, undo operations, dialogs, command handlers, map serialization, and W3D
rendering remain the implementation.

The browser layer may replace MFC and Win32 platform services—window creation,
message delivery, controls, resource loading, file pickers, profile storage,
and device setup—but it must route those services back into the original
application. It must not introduce a parallel map model or rewritten editor.

`original-parity-inventory.json` is generated from the original Visual Studio
project, resource script, resource identifiers, and MFC message maps:

```sh
npm run generate:world-builder-parity
npm run test:world-builder-parity
```

The inventory is a coverage boundary, not completion evidence by itself.
Completion requires every applicable inventoried command, dialog, tool, and
view to be reachable through the original handlers and verified against the
Windows application.
