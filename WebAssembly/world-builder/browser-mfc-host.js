(function installWorldBuilderBrowserHost(global) {
  "use strict";

  const CONTROL_KIND = Object.freeze({
    generic: 0,
    button: 1,
    edit: 2,
    "rich-edit": 3,
    static: 4,
    "combo-box": 5,
    "list-box": 6,
    "list-control": 7,
    "tree-control": 8,
    slider: 9,
    "scroll-bar": 10,
    progress: 11,
    "status-bar": 12,
    toolbar: 13,
    "tab-control": 0,
  });
  const NOTIFY = Object.freeze({
    BN_CLICKED: 0,
    CBN_SELCHANGE: 1,
    CBN_KILLFOCUS: 4,
    CBN_EDITCHANGE: 5,
    CBN_CLOSEUP: 8,
    CBN_SELENDOK: 9,
    EN_KILLFOCUS: 0x0200,
    EN_CHANGE: 0x0300,
    EN_UPDATE: 0x0400,
    LBN_SELCHANGE: 1,
    LBN_DBLCLK: 2,
  });
  const SHOW = Object.freeze({
    HIDE: 0,
    MINIMIZED: new Set([2, 6, 7, 11]),
  });
  const TREE_ROOT = 0xffff0000;
  const TREE_FIRST = 0xffff0001;
  const TREE_LAST = 0xffff0002;
  const TREE_SORT = 0xffff0003;
  const TVIF = Object.freeze({
    TEXT: 0x0001,
    IMAGE: 0x0002,
    PARAM: 0x0004,
    STATE: 0x0008,
    SELECTED_IMAGE: 0x0020,
  });
  const SWP = Object.freeze({
    NOSIZE: 0x0001,
    NOMOVE: 0x0002,
    NOZORDER: 0x0004,
    NOREDRAW: 0x0008,
    SHOWWINDOW: 0x0040,
    HIDEWINDOW: 0x0080,
  });
  const RDW = Object.freeze({
    INVALIDATE: 0x0001,
    UPDATENOW: 0x0100,
  });
  const WM = Object.freeze({
    SIZE: 0x0005,
    PAINT: 0x000f,
    CLOSE: 0x0010,
    SETCURSOR: 0x0020,
    KEYDOWN: 0x0100,
    KEYUP: 0x0101,
    TIMER: 0x0113,
    HSCROLL: 0x0114,
    VSCROLL: 0x0115,
    MOUSEMOVE: 0x0200,
    LBUTTONDOWN: 0x0201,
    LBUTTONUP: 0x0202,
    RBUTTONDOWN: 0x0204,
    RBUTTONUP: 0x0205,
    MBUTTONDOWN: 0x0207,
    MBUTTONUP: 0x0208,
  });
  const MK = Object.freeze({
    LBUTTON: 0x0001,
    RBUTTON: 0x0002,
    SHIFT: 0x0004,
    CONTROL: 0x0008,
    MBUTTON: 0x0010,
  });
  const RESOURCE_STYLE_BITS = Object.freeze({
    WS_CHILD: 0x40000000,
    WS_VISIBLE: 0x10000000,
    WS_DISABLED: 0x08000000,
    WS_CLIPSIBLINGS: 0x04000000,
    WS_CLIPCHILDREN: 0x02000000,
    WS_BORDER: 0x00800000,
    WS_VSCROLL: 0x00200000,
    WS_HSCROLL: 0x00100000,
    WS_GROUP: 0x00020000,
    WS_TABSTOP: 0x00010000,
    TVS_HASBUTTONS: 0x0001,
    TVS_HASLINES: 0x0002,
    TVS_LINESATROOT: 0x0004,
    TVS_EDITLABELS: 0x0008,
    TVS_DISABLEDRAGDROP: 0x0010,
    TVS_SHOWSELALWAYS: 0x0020,
    TVS_NOTOOLTIPS: 0x0080,
    TVS_TRACKSELECT: 0x0200,
  });

  const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, value));
  const unsigned = (value) => Number(value) >>> 0;
  const colorCss = (color, alpha = 1) => {
    const value = unsigned(color);
    const red = value & 0xff;
    const green = (value >>> 8) & 0xff;
    const blue = (value >>> 16) & 0xff;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };
  const argbCss = (color) => {
    const value = unsigned(color);
    return `rgba(${(value >>> 16) & 0xff}, ${(value >>> 8) & 0xff}, ${value & 0xff}, ${
      ((value >>> 24) & 0xff) / 255
    })`;
  };
  const stripMnemonic = (value) => String(value ?? "")
    .replaceAll("&&", "\0")
    .replaceAll("&", "")
    .replaceAll("\0", "&");
  const splitMenuLabel = (value) => {
    const [label, accelerator = ""] = stripMnemonic(value).split("\t");
    return { label, accelerator };
  };
  const controlKey = (parent, id) => `${unsigned(parent)}:${Number(id) | 0}`;
  const profileKey = (section, entry) =>
    `new-shoes.world-builder.profile.${section}.${entry}`;
  const rectWidth = (rect) => Math.max(0, rect.right - rect.left);
  const rectHeight = (rect) => Math.max(0, rect.bottom - rect.top);
  const resourceControlStyle = (styleText) => {
    const source = String(styleText ?? "");
    let style =
      RESOURCE_STYLE_BITS.WS_CHILD |
      RESOURCE_STYLE_BITS.WS_VISIBLE;
    for (const [name, bit] of Object.entries(RESOURCE_STYLE_BITS)) {
      if (new RegExp(`\\b${name}\\b`).test(source)) style |= bit;
      if (new RegExp(`\\bNOT\\s+${name}\\b`).test(source)) style &= ~bit;
    }
    return unsigned(style);
  };

  class BrowserMfcHost {
    constructor(module) {
      this.module = module;
      this.initialized = false;
      this.resources = null;
      this.resourcesByDialog = new Map();
      this.resourcesByMenu = new Map();
      this.resourcesByToolbar = new Map();
      this.resourcesByString = new Map();
      this.resourcesByFile = new Map();
      this.windows = new Map();
      this.controls = new Map();
      this.menus = new Map();
      this.images = new Map();
      this.imageLists = new Map();
      this.timers = new Map();
      this.commandStates = new Map();
      this.commandStateSequence = 0;
      this.commandRequestSequence = 0;
      this.commandRequestTokens = new Map();
      this.commandCompletedTokens = new Map();
      this.commandStateHistory = [];
      this.modalWaiters = new Map();
      this.nextWindow = 2;
      this.nextMenu = 1;
      this.nextImage = 1;
      this.nextImageList = 1;
      this.nextTreeItem = 1;
      this.nextTimerEvent = 0x7000;
      this.focusedWindow = 0;
      this.capturedWindow = 0;
      this.coordinateInput = { x: 0, y: 0 };
      this.pendingProfileString = null;
      this.launchPath = "";
      this.pendingGameWindow = null;
      this.lastGameLaunch = null;
      this.primaryRenderCanvas = null;
      this.desktop = null;
      this.windowLayer = null;
      this.modalLayer = null;
      this.statusElement = null;
      this.audioContext = null;
      this.soundPreviewSource = null;
      this.soundPreviewGeneration = 0;
    }

    initialize() {
      if (this.initialized) return;
      const source = this.module.FS.readFile(
        "/world-builder/original-resources.json",
        { encoding: "utf8" },
      );
      this.resources = JSON.parse(source);
      for (const resource of this.resources.dialogs) {
        this.resourcesByDialog.set(unsigned(resource.value), resource);
      }
      for (const resource of this.resources.menus) {
        this.resourcesByMenu.set(unsigned(resource.value), resource);
      }
      for (const resource of this.resources.toolbars) {
        this.resourcesByToolbar.set(unsigned(resource.value), resource);
      }
      for (const resource of this.resources.strings) {
        this.resourcesByString.set(unsigned(resource.value), resource.text);
      }
      for (const resource of this.resources.files) {
        this.resourcesByFile.set(
          `${unsigned(resource.value)}:${String(resource.kind).toLowerCase()}`,
          resource,
        );
      }
      this.desktop = document.querySelector("[data-world-builder-desktop]");
      if (!this.desktop) {
        this.desktop = document.createElement("main");
        this.desktop.dataset.worldBuilderDesktop = "";
        document.body.append(this.desktop);
      }
      this.windowLayer = document.createElement("div");
      this.windowLayer.className = "wb-window-layer";
      this.modalLayer = document.createElement("div");
      this.modalLayer.className = "wb-modal-layer";
      this.modalLayer.hidden = true;
      this.desktop.append(this.windowLayer, this.modalLayer);
      this.desktop.addEventListener("pointerdown", () => {
        const context = this.ensureAudioContext();
        if (context?.state === "suspended") void context.resume().catch(() => {});
      }, { capture: true });
      const desktopRect = this.desktop.getBoundingClientRect();
      this.windows.set(1, {
        id: 1,
        parent: 0,
        controlId: 0,
        kind: CONTROL_KIND.generic,
        className: "Desktop",
        style: 0,
        rect: {
          left: 0,
          top: 0,
          right: Math.max(1024, Math.round(desktopRect.width)),
          bottom: Math.max(768, Math.round(desktopRect.height)),
        },
        visible: true,
        minimized: false,
        enabled: true,
        text: "",
        element: this.desktop,
        children: [],
        items: [],
        itemData: [],
        selectedItems: new Set(),
        selectedItem: -1,
      });
      this.installGlobalInput();
      this.initialized = true;
      this.report("Original World Builder platform host ready");
    }

    number(method, string0, string1, numbers) {
      const n = numbers;
      switch (method) {
        case "createDialog":
          return this.createDialog(n[0], n[1]);
        case "createControl":
          return this.createControl(n[0], n[1], n[2], {
            left: n[3],
            top: n[4],
            right: n[5],
            bottom: n[6],
          }, n[7]);
        case "createWindow":
          return this.createWindow(string0, string1, n[0], {
            left: n[1],
            top: n[2],
            right: n[3],
            bottom: n[4],
          }, n[5], n[6]);
        case "createWindowEx":
          return this.createWindowEx(n[0], string0, string1, n[1], {
            left: n[2],
            top: n[3],
            right: n[4],
            bottom: n[5],
          }, n[6], n[7]);
        case "createFrame":
          return this.createFrame(n[0], n[1], n[2]);
        case "createDialogBar":
          return this.createDialogBar(n[0], n[1], n[2], n[3]);
        case "findControl":
          return this.findControl(n[0], n[1]);
        case "controlKind":
          return this.window(n[0]).kind;
        case "setWindowText":
          this.setWindowText(n[0], string0);
          return 1;
        case "addItem":
          return this.insertItem(n[0], this.window(n[0]).items.length, string0);
        case "insertItem":
          return this.insertItem(n[0], n[1], string0);
        case "deleteItem":
          return this.deleteItem(n[0], n[1]);
        case "resetItems":
          this.resetItems(n[0]);
          return 1;
        case "itemCount":
          return this.window(n[0]).items.length;
        case "selectedItem":
          return this.window(n[0]).selectedItem;
        case "setSelectedItem":
          return this.setSelectedItem(n[0], n[1]);
        case "itemData":
          return this.window(n[0]).itemData[n[1]] ?? 0xffffffff;
        case "setItemData":
          return this.setItemData(n[0], n[1], n[2]);
        case "itemSelected":
          return this.itemSelected(n[0], n[1]);
        case "setItemSelected":
          return this.setItemSelected(n[0], n[1], Boolean(n[2]));
        case "findItem":
          return this.findItem(n[0], n[1], string0, Boolean(n[2]));
        case "setHorizontalExtent":
          this.window(n[0]).horizontalExtent = Math.max(0, n[1] | 0);
          return 1;
        case "insertListColumn":
          return this.insertListColumn(n[0], n[1], string0, n[2], n[3], n[4]);
        case "setListItemText":
          return this.setListItemText(n[0], n[1], n[2], string0) ? 1 : 0;
        case "ensureListItemVisible":
          return this.ensureListItemVisible(n[0], n[1]) ? 1 : 0;
        case "checkState":
          return this.window(n[0]).checkState ?? 0;
        case "buttonState":
          return (this.window(n[0]).checkState ?? 0) |
            (this.focusedWindow === unsigned(n[0]) ? 0x0008 : 0);
        case "setCheckState":
          this.setCheckState(n[0], n[1]);
          return 1;
        case "setControlRange":
          this.setControlRange(n[0], n[1], n[2]);
          return 1;
        case "controlPosition":
          return this.window(n[0]).position ?? 0;
        case "setControlPosition":
          return this.setControlPosition(n[0], n[1]);
        case "setControlTickFrequency":
          this.window(n[0]).tickFrequency = n[1] | 0;
          return 1;
        case "textSelectionStart":
          return this.textSelection(n[0]).start;
        case "textSelectionEnd":
          return this.textSelection(n[0]).end;
        case "setTextSelection":
          this.setTextSelection(n[0], n[1], n[2]);
          return 1;
        case "richEditEventMask":
          return this.window(n[0]).richEditEventMask ?? 0;
        case "setRichEditEventMask":
          this.window(n[0]).richEditEventMask = unsigned(n[1]);
          return 1;
        case "setRichEditDefaultFormat":
        case "setRichEditSelectionFormat":
          return this.setRichTextFormat(method, n[0], string0, n.slice(1)) ? 1 : 0;
        case "beginPaint":
          this.beginPaint(n[0]);
          return 1;
        case "endPaint":
          this.endPaint(n[0]);
          return 1;
        case "fillRectangle":
          this.fillRectangle(n[0], {
            left: n[1],
            top: n[2],
            right: n[3],
            bottom: n[4],
          }, n[5]);
          return 1;
        case "drawLine":
          this.drawLine(n[0], { x: n[1], y: n[2] }, { x: n[3], y: n[4] }, {
            penStyle: n[5],
            penWidth: n[6],
            color: n[7],
          });
          return 1;
        case "drawEllipse":
          this.drawEllipse(n[0], {
            left: n[1],
            top: n[2],
            right: n[3],
            bottom: n[4],
          }, {
            penStyle: n[5],
            penWidth: n[6],
            penColor: n[7],
            fill: string1 === "1",
            fillColor: Number(string0),
          });
          return 1;
        case "windowStyle":
          return this.window(n[0]).style;
        case "setWindowPosition":
          return this.setWindowPosition(n[0], n[1], n[2], n[3], n[4], n[5], n[6]) ? 1 : 0;
        case "redrawWindow":
          return this.redrawWindow(n[0], Boolean(n[1]), {
            left: n[2],
            top: n[3],
            right: n[4],
            bottom: n[5],
          }, n[6]) ? 1 : 0;
        case "hasUpdateRect":
          return this.window(n[0]).updateRect ? 1 : 0;
        case "setScrollRange":
          this.setScrollRange(n[0], n[1], n[2], n[3]);
          return 1;
        case "setScrollPosition":
          return this.setScrollPosition(n[0], n[1], n[2]);
        case "scrollWindow":
          this.scrollWindow(n[0], n[1], n[2]);
          return 1;
        case "printWindow":
          this.printWindow(n[0], Boolean(n[1]));
          return 1;
        case "setCoordinateInput":
          this.coordinateInput = { x: n[0] | 0, y: n[1] | 0 };
          return 1;
        case "showWindow":
          return this.showWindow(n[0], n[1]) ? 1 : 0;
        case "isWindowVisible":
          return this.window(n[0]).visible ? 1 : 0;
        case "isWindowMinimized":
          return this.window(n[0]).minimized ? 1 : 0;
        case "setEnabled":
          this.setEnabled(n[0], Boolean(n[1]));
          return 1;
        case "isEnabled":
          return this.window(n[0]).enabled ? 1 : 0;
        case "setCapture": {
          const previous = this.capturedWindow;
          this.capturedWindow = unsigned(n[0]);
          return previous;
        }
        case "releaseCapture":
          this.capturedWindow = 0;
          return 1;
        case "capturedWindow":
          return this.capturedWindow;
        case "insertTreeItem":
          return this.insertTreeItem(n[0], n[1], n[2], string0, n[3], n[4], n[5], n[6]);
        case "treeItemExists":
          return this.treeNode(n[0], n[1], false) ? 1 : 0;
        case "treeItemParameter":
          return this.treeNode(n[0], n[1]).parameter;
        case "treeItemState":
          return this.treeNode(n[0], n[1]).state;
        case "treeItemImage":
          return this.treeNode(n[0], n[1]).image;
        case "treeItemSelectedImage":
          return this.treeNode(n[0], n[1]).selectedImage;
        case "treeItemChildCount":
          return this.treeNode(n[0], n[1]).children.length;
        case "writeTreeItem":
          return this.writeTreeItem(n[0], n[1], n[2], string0, n[3], n[4], n[5], n[6], n[7]) ? 1 : 0;
        case "firstTreeChild":
          return this.firstTreeChild(n[0], n[1]);
        case "nextTreeSibling":
          return this.nextTreeSibling(n[0], n[1]);
        case "parentTreeItem":
          return this.treeNode(n[0], n[1]).parent;
        case "deleteTreeItem":
          return this.deleteTreeItem(n[0], n[1]) ? 1 : 0;
        case "deleteAllTreeItems":
          this.deleteAllTreeItems(n[0]);
          return 1;
        case "selectedTreeItem":
          return this.window(n[0]).treeSelected ?? 0;
        case "selectTreeItem":
          return this.selectTreeItem(n[0], n[1]) ? 1 : 0;
        case "selectTreeDropTarget":
          this.window(n[0]).treeDropTarget = unsigned(n[1]);
          this.renderTree(this.window(n[0]));
          return 1;
        case "setTreeFirstVisibleItem":
          return this.setTreeFirstVisibleItem(n[0], n[1]) ? 1 : 0;
        case "treeHitTestFlags":
          return this.hitTestTreeItem(n[0], n[1], n[2]).flags;
        case "hitTestTreeItem":
          return this.hitTestTreeItem(n[0], n[1], n[2]).item;
        case "beginTreeLabelEdit":
          return this.beginTreeLabelEdit(n[0], n[1]);
        case "endTreeLabelEdit":
          return this.endTreeLabelEdit(n[0], Boolean(n[1])) ? 1 : 0;
        case "createImageList":
          return this.createImageList(n[0], n[1], n[2], n[3], n[4]);
        case "createImageListFromBitmap":
          return this.createImageListFromBitmap(n[0], n[1], n[2], n[3]);
        case "addImageListIcon":
          return this.addImageListIcon(n[0], n[1]);
        case "setTreeImageList": {
          const record = this.window(n[0]);
          const previous = record.imageLists?.get(n[2]) ?? 0;
          record.imageLists ??= new Map();
          record.imageLists.set(n[2], unsigned(n[1]));
          return previous;
        }
        case "createStatusBar":
          return this.createStatusBar(n[0]);
        case "createToolBar":
          return this.createToolBar(n[0], n[1], n[2]);
        case "loadToolBarResource":
          return this.loadToolBarResource(n[0], n[1]) ? 1 : 0;
        case "enableDocking":
          this.window(n[0]).dockingAlignment = unsigned(n[1]);
          return 1;
        case "dockControlBar":
          this.dockControlBar(n[0], n[1]);
          return 1;
        case "floatControlBar":
          this.floatControlBar(n[0], n[1], n[2], n[3], n[4]);
          return 1;
        case "saveBarState":
          this.saveBarState(n[0], string0);
          return 1;
        case "setFrameMessage":
          this.setFrameMessage(n[0], string0);
          return 1;
        case "loadMenuResource":
          return this.loadMenuResource(n[0]);
        case "submenu":
          return this.submenu(n[0], n[1]);
        case "appendMenuItem":
          return this.appendMenuItem(n[0], n[1], n[2], string0) ? 1 : 0;
        case "removeMenuItem":
          return this.removeMenuItem(n[0], n[1], n[2]) ? 1 : 0;
        case "enableMenuItem":
          return this.enableMenuItem(n[0], n[1], n[2]);
        case "checkMenuItem":
          return this.checkMenuItem(n[0], n[1], n[2]);
        case "trackPopupMenu":
          return this.trackPopupMenu(n[0], n[1], n[2], n[3], n[4]);
        case "destroyMenu":
          return this.menus.delete(unsigned(n[0])) ? 1 : 0;
        case "destroyWindow":
          return this.destroyWindow(n[0]) ? 1 : 0;
        case "setTimer":
          return this.setTimer(n[0], n[1], n[2]);
        case "killTimer":
          return this.killTimer(n[0], n[1]) ? 1 : 0;
        case "deliverNativeMessage":
          return this.deliverNativeMessage(n[0], n[1], n[2], n[3]);
        case "setFocus":
          this.setFocus(n[0]);
          return 1;
        case "createPropertySheet":
          return this.createPropertySheet(string0, n[0]);
        case "addPropertyPage":
          this.addPropertyPage(n[0], n[1], n[2]);
          return 1;
        case "selectPropertyPage":
          this.selectPropertyPage(n[0], n[1]);
          return 1;
        case "closeDialog":
          this.closeDialog(n[0], n[1]);
          return 1;
        case "loadIcon":
          return this.loadImage(n[0], 1, 0, 0, 0);
        case "loadImage":
          return this.loadImage(n[0], n[1], n[2], n[3], n[4]);
        case "destroyImage":
          return this.destroyImage(n[0]) ? 1 : 0;
        case "drawIcon":
          this.drawIcon(n[0], n[1], n[2], n[3], n[4], n[5]);
          return 1;
        case "systemColor":
          return this.systemColor(n[0]);
        case "beep":
          return this.beep(n[0], n[1]) ? 1 : 0;
        case "initializeControls":
          return 1;
        case "loadCursor":
          return this.loadImage(n[0], 2, 0, 0, 0);
        case "destroyCursor":
          return this.destroyImage(n[0]) ? 1 : 0;
        case "messageBeep":
          return this.beep(880, 45) ? 1 : 0;
        case "playSound":
          return this.playSound(string0) ? 1 : 0;
        case "readProfileInt":
          return this.readProfileInt(string0, string1, n[0]);
        case "writeProfileInt":
          this.writeProfile(string0, string1, String(n[0] | 0));
          return 1;
        case "writeProfileString": {
          const [section, entry] = string0.split("\x1f");
          this.writeProfile(section, entry, string1);
          return 1;
        }
        case "systemMetric":
          return this.systemMetric(n[0]);
        case "uninitializeComApartment":
          return 1;
        default:
          throw new Error(`Unsupported browser MFC numeric operation: ${method}`);
      }
    }

    string(method, string0, string1, numbers) {
      switch (method) {
        case "getWindowText":
          return this.getWindowText(numbers[0]);
        case "itemText":
          return this.window(numbers[0]).items[numbers[1]] ?? "";
        case "treeItemText":
          return this.treeNode(numbers[0], numbers[1]).text;
        case "loadString":
          return this.resourcesByString.get(unsigned(numbers[0])) ?? "";
        case "documentString":
          return this.documentString(numbers[0], numbers[1]);
        case "launchDocumentPath":
          return this.launchPath;
        case "readProfileString": {
          const [section, entry] = string0.split("\x1f");
          return localStorage.getItem(profileKey(section, entry)) ?? string1;
        }
        default:
          throw new Error(`Unsupported browser MFC string operation: ${method}`);
      }
    }

    rect(method, windowId) {
      const record = this.window(windowId);
      const origin = this.windowScreenOrigin(record);
      switch (method) {
        case "windowRect":
          return {
            left: origin.x,
            top: origin.y,
            right: origin.x + rectWidth(record.rect),
            bottom: origin.y + rectHeight(record.rect),
          };
        case "clientRect":
          return {
            left: 0,
            top: 0,
            right: rectWidth(record.rect),
            bottom: rectHeight(record.rect),
          };
        case "updateRect":
          return record.updateRect ?? { left: 0, top: 0, right: 0, bottom: 0 };
        case "screenToClient":
          return {
            left: this.coordinateInput.x - origin.x,
            top: this.coordinateInput.y - origin.y,
            right: 0,
            bottom: 0,
          };
        case "clientToScreen":
          return {
            left: this.coordinateInput.x + origin.x,
            top: this.coordinateInput.y + origin.y,
            right: 0,
            bottom: 0,
          };
        default:
          throw new Error(`Unsupported browser MFC rectangle operation: ${method}`);
      }
    }

    windowScreenOrigin(record) {
      let x = record.rect.left;
      let y = record.rect.top;
      let current = record;
      while (current.parent) {
        const parent = this.windows.get(current.parent);
        if (!parent || parent.id === 1) break;
        const topLevel =
          current.element?.parentElement === this.windowLayer ||
          current.element?.parentElement === this.modalLayer;
        if (topLevel) break;
        x += parent.rect.left;
        y += parent.rect.top;
        current = parent;
      }
      return { x, y };
    }

    uintVector(method, owner, values) {
      if (method !== "setStatusIndicators") {
        throw new Error(`Unsupported browser MFC vector operation: ${method}`);
      }
      const record = this.window(owner);
      record.indicators = values;
      this.renderStatusBar(record);
    }

    window(id) {
      const key = unsigned(id);
      const record = this.windows.get(key);
      if (!record) throw new Error(`Unknown browser MFC window ${key}`);
      return record;
    }

    allocateWindow(specification) {
      const id = this.nextWindow++;
      const record = {
        id,
        parent: unsigned(specification.parent ?? 0),
        controlId: Number(specification.controlId ?? 0) | 0,
        kind: specification.kind ?? CONTROL_KIND.generic,
        className: specification.className ?? "",
        resourceId: unsigned(specification.resourceId ?? 0),
        style: unsigned(specification.style ?? 0),
        styleText: specification.styleText ?? "",
        rect: specification.rect ?? { left: 0, top: 0, right: 120, bottom: 24 },
        visible: Boolean(specification.visible),
        minimized: false,
        enabled: specification.enabled !== false,
        text: specification.text ?? "",
        element: specification.element ?? null,
        overlay: null,
        children: [],
        items: [],
        itemData: [],
        listRows: [],
        listColumns: [],
        selectedItem: -1,
        selectedItems: new Set(),
        checkState: 0,
        minimum: 0,
        maximum: 100,
        position: 0,
        richEditEventMask: 0,
        treeNodes: new Map(),
        treeRoots: [],
        treeSelected: 0,
        treeDropTarget: 0,
        scrollRanges: new Map(),
        scrollPositions: new Map(),
        updateRect: null,
        radioGroup: Number(specification.radioGroup ?? 0) | 0,
      };
      this.windows.set(id, record);
      if (record.parent) {
        const parent = this.window(record.parent);
        parent.children.push(id);
        if (record.controlId !== -1) {
          this.controls.set(controlKey(record.parent, record.controlId), id);
        }
      }
      return record;
    }

    createDialog(resourceId, parent) {
      const resource = this.resourcesByDialog.get(unsigned(resourceId));
      if (unsigned(resourceId) !== 0 && !resource) {
        throw new Error(`Missing original dialog resource ${unsigned(resourceId)}`);
      }
      const modalMessage = unsigned(resourceId) === 0;
      const unitX = 1.75;
      const unitY = 1.9;
      const width = Math.round((resource?.width ?? 260) * unitX);
      const height = Math.round((resource?.height ?? 120) * unitY);
      const parentRecord = parent ? this.window(parent) : this.window(1);
      const left = Math.round(
        parentRecord.rect.left + Math.max(12, (rectWidth(parentRecord.rect) - width) / 2),
      );
      const top = Math.round(
        parentRecord.rect.top + Math.max(12, (rectHeight(parentRecord.rect) - height) / 2),
      );
      const element = document.createElement("section");
      element.className = "wb-window wb-dialog";
      element.dataset.resourceId = String(unsigned(resourceId));
      element.setAttribute("role", "dialog");
      element.setAttribute("aria-label", resource?.caption || "World Builder message");
      const title = document.createElement("header");
      title.className = "wb-titlebar";
      const titleText = document.createElement("span");
      titleText.className = "wb-title-text";
      titleText.textContent = resource?.caption || "World Builder";
      title.append(titleText);
      const closeButton = /\bWS_SYSMENU\b/.test(resource?.style ?? "")
        ? document.createElement("button")
        : null;
      if (closeButton) {
        closeButton.type = "button";
        closeButton.className = "wb-title-close";
        closeButton.setAttribute("aria-label", "Close");
        closeButton.textContent = "×";
        title.append(closeButton);
      }
      const client = document.createElement("div");
      client.className = "wb-dialog-client";
      element.append(title, client);
      const record = this.allocateWindow({
        parent,
        resourceId,
        className: "Dialog",
        rect: { left, top, right: left + width, bottom: top + height },
        text: resource?.caption ?? "",
        styleText: resource?.style ?? "",
        enabled: !/\bWS_DISABLED\b/.test(resource?.style ?? ""),
        element,
      });
      record.client = client;
      element.dataset.windowId = String(record.id);
      record.modalMessage = modalMessage;
      closeButton?.addEventListener("click", () => {
        this.dispatchWindowMessage(record.id, WM.CLOSE, 0, 0, 0);
      });
      this.applyWindowRect(record);
      element.hidden = true;
      this.windowLayer.append(element);
      for (const control of resource?.controls ?? []) {
        this.createResourceControl(record, control, unitX, unitY);
      }
      return record.id;
    }

    createResourceControl(dialog, resource, unitX, unitY) {
      const styleText = resource.style ?? "";
      const radio = /RADIO/.test((resource.keyword ?? "") + styleText);
      if (radio && (!dialog.currentRadioGroup || /\bWS_GROUP\b/.test(styleText))) {
        dialog.currentRadioGroup = (dialog.currentRadioGroup ?? 0) + 1;
      }
      const record = this.allocateWindow({
        parent: dialog.id,
        controlId: resource.value,
        kind: CONTROL_KIND[resource.kind] ?? CONTROL_KIND.generic,
        className: resource.className || resource.keyword,
        rect: {
          left: Math.round(resource.x * unitX),
          top: Math.round(resource.y * unitY),
          right: Math.round((resource.x + resource.width) * unitX),
          bottom: Math.round((resource.y + resource.height) * unitY),
        },
        text: resource.label,
        style: resourceControlStyle(styleText),
        styleText,
        visible: !/\bNOT\s+WS_VISIBLE\b/.test(styleText),
        enabled: !/\bWS_DISABLED\b/.test(styleText),
        radioGroup: radio ? dialog.currentRadioGroup : 0,
      });
      record.resourceControl = resource;
      record.element = this.createControlElement(record);
      this.applyControlRect(record);
      dialog.client.append(record.element);
      if (record.dataList) dialog.client.append(record.dataList);
      this.syncControl(record);
    }

    createControl(kind, parent, controlId, rect, style) {
      const record = this.allocateWindow({
        parent,
        controlId,
        kind: Number(kind) | 0,
        className: "DynamicControl",
        rect,
        style,
        visible: Boolean(unsigned(style) & 0x10000000),
      });
      record.element = this.createControlElement(record);
      const parentRecord = this.window(parent);
      (parentRecord.client ?? parentRecord.element).append(record.element);
      if (record.dataList) {
        (parentRecord.client ?? parentRecord.element).append(record.dataList);
      }
      this.applyControlRect(record);
      this.syncControl(record);
      return record.id;
    }

    createWindow(className, windowName, style, rect, parent, controlId) {
      const isView = className === "MFCView";
      const element = isView
        ? this.createViewElement()
        : this.createCustomWindowElement(rect);
      element.classList.add("wb-native-window");
      if (isView) element.classList.add("wb-view");
      const record = this.allocateWindow({
        parent,
        controlId,
        className,
        rect,
        style,
        text: windowName,
        visible: Boolean(unsigned(style) & 0x10000000),
        element,
      });
      const parentRecord = this.window(parent || 1);
      (parentRecord.client ?? parentRecord.element).append(element);
      this.applyControlRect(record);
      this.bindCanvasWindowInput(record, isView);
      return record.id;
    }

    createWindowEx(extendedStyle, className, windowName, style, rect, parent, controlId) {
      const id = this.createWindow(className, windowName, style, rect, parent, controlId);
      this.window(id).extendedStyle = unsigned(extendedStyle);
      return id;
    }

    createFrame(resourceId, style, parent) {
      const desktop = this.window(1);
      const element = document.createElement("section");
      element.className = "wb-window wb-main-frame";
      const title = document.createElement("header");
      title.className = "wb-titlebar";
      title.innerHTML = "<span>Command &amp; Conquer Generals World Builder</span>";
      const menu = document.createElement("nav");
      menu.className = "wb-menubar";
      menu.setAttribute("aria-label", "World Builder menu");
      const chrome = document.createElement("div");
      chrome.className = "wb-frame-chrome";
      const client = document.createElement("div");
      client.className = "wb-frame-client";
      const statusChrome = document.createElement("div");
      statusChrome.className = "wb-frame-status";
      element.append(title, menu, chrome, client, statusChrome);
      const record = this.allocateWindow({
        parent,
        resourceId,
        className: "Frame",
        rect: {
          left: 10,
          top: 10,
          right: Math.max(810, desktop.rect.right - 10),
          bottom: Math.max(610, desktop.rect.bottom - 10),
        },
        style,
        text: "Command & Conquer Generals World Builder",
        visible: true,
        element,
      });
      record.client = client;
      element.dataset.windowId = String(record.id);
      record.chrome = chrome;
      record.statusChrome = statusChrome;
      record.menuElement = menu;
      this.applyWindowRect(record);
      this.windowLayer.append(element);
      const menuResource = this.resourcesByMenu.get(unsigned(resourceId));
      if (menuResource) {
        record.menuItems = structuredClone(menuResource.items);
        this.applyRecentFiles(record.menuItems);
        this.renderFrameMenu(record, record.menuItems);
      }
      this.mainFrame = record.id;
      return record.id;
    }

    createDialogBar(resourceId, style, parent, controlId) {
      const id = this.createDialog(resourceId, parent);
      const record = this.window(id);
      record.controlId = Number(controlId) | 0;
      record.style = unsigned(style);
      this.controls.set(controlKey(parent, controlId), id);
      record.element.classList.add("wb-dialog-bar");
      return id;
    }

    findControl(parent, controlId) {
      const found = this.controls.get(controlKey(parent, controlId));
      return found ?? 0;
    }

    createControlElement(record) {
      const resource = record.resourceControl ?? {};
      const keyword = resource.keyword ?? "";
      let element;
      if (record.kind === CONTROL_KIND.button) {
        if (/GROUPBOX/.test(keyword)) {
          element = document.createElement("fieldset");
          const legend = document.createElement("legend");
          legend.textContent = stripMnemonic(record.text);
          element.append(legend);
        } else if (/CHECK|3STATE|RADIO/.test(keyword) ||
            /BS_AUTO(?:CHECKBOX|3STATE|RADIOBUTTON)/.test(record.styleText)) {
          const label = document.createElement("label");
          label.className = "wb-choice";
          const input = document.createElement("input");
          input.type = /RADIO/.test(keyword + record.styleText) ? "radio" : "checkbox";
          input.name = input.type === "radio"
            ? `wb-radio-${record.parent}-${record.radioGroup}`
            : "";
          record.isThreeState = /3STATE/.test(keyword + record.styleText);
          const caption = document.createElement("span");
          caption.textContent = stripMnemonic(record.text);
          label.append(input, caption);
          element = label;
          record.input = input;
        } else {
          element = document.createElement("button");
          element.type = "button";
          element.textContent = stripMnemonic(record.text);
        }
      } else if (record.kind === CONTROL_KIND.edit ||
          record.kind === CONTROL_KIND["rich-edit"]) {
        element = /ES_MULTILINE/.test(record.styleText)
          ? document.createElement("textarea")
          : document.createElement("input");
        if (element instanceof HTMLInputElement) element.type = "text";
        element.readOnly = /\bES_READONLY\b/.test(record.styleText);
      } else if (record.kind === CONTROL_KIND["combo-box"]) {
        record.editableCombo = /\bCBS_(?:DROPDOWN|SIMPLE)\b/.test(record.styleText);
        if (record.editableCombo) {
          element = document.createElement("input");
          element.type = "text";
          record.dataList = document.createElement("datalist");
          record.dataList.id = `wb-combo-options-${record.id}`;
          element.setAttribute("list", record.dataList.id);
        } else {
          element = document.createElement("select");
          element.size = 1;
        }
      } else if (record.kind === CONTROL_KIND["list-box"]) {
        element = document.createElement("select");
        element.multiple = /\bLBS_(?:MULTIPLESEL|EXTENDEDSEL)\b/.test(record.styleText);
      } else if (record.kind === CONTROL_KIND["list-control"]) {
        element = document.createElement("div");
        element.className = "wb-list-control";
      } else if (record.kind === CONTROL_KIND["tree-control"]) {
        element = document.createElement("div");
        element.className = "wb-tree-control";
        element.setAttribute("role", "tree");
      } else if (record.kind === CONTROL_KIND.slider) {
        element = document.createElement("input");
        element.type = "range";
      } else if (record.kind === CONTROL_KIND["scroll-bar"]) {
        element = document.createElement("input");
        element.type = "range";
        element.className = "wb-scrollbar";
      } else if (record.kind === CONTROL_KIND.progress) {
        element = document.createElement("progress");
      } else if (record.className === "SysTabControl32") {
        element = document.createElement("div");
        element.className = "wb-tabs";
        element.setAttribute("role", "tablist");
      } else {
        const bitmapResource = /\bSS_BITMAP\b/.test(record.styleText)
          ? Number(record.text)
          : 0;
        if (Number.isSafeInteger(bitmapResource) && bitmapResource > 0) {
          element = document.createElement("img");
          element.className = "wb-static wb-resource-bitmap";
          element.alt = "";
          const imageId = this.loadImage(bitmapResource, 0, 0, 0, 0);
          element.src = this.images.get(imageId)?.url ?? "";
        } else {
          element = document.createElement("span");
          element.className = "wb-static";
          element.textContent = stripMnemonic(record.text);
        }
      }
      element.classList.add("wb-control");
      element.dataset.windowId = String(record.id);
      element.dataset.controlId = String(record.controlId);
      element.hidden = !record.visible;
      this.bindControlEvents(record, element);
      return element;
    }

    bindControlEvents(record, element) {
      const dispatch = (notification) => {
        if (
          !record.enabled ||
          record.destroying ||
          !this.windows.has(record.id) ||
          !this.windows.has(record.parent)
        ) {
          return;
        }
        this.dispatchControl(record.parent, record.controlId, notification, record.id);
      };
      if (record.kind === CONTROL_KIND.button) {
        let pointerButtons = 0;
        const pointerFlags = (event) => pointerButtons |
          (event.shiftKey ? MK.SHIFT : 0) |
          (event.ctrlKey ? MK.CONTROL : 0);
        element.addEventListener("pointerdown", (event) => {
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
          }
          const buttonFlag = event.button === 0
            ? MK.LBUTTON
            : event.button === 1
              ? MK.MBUTTON
              : MK.RBUTTON;
          pointerButtons |= buttonFlag;
          const message = event.button === 0
            ? WM.LBUTTONDOWN
            : event.button === 1
              ? WM.MBUTTONDOWN
              : WM.RBUTTONDOWN;
          const target = this.capturedWindow || record.id;
          const point = this.pointerPoint(event, target);
          this.dispatchPointer(
            target,
            message,
            pointerFlags(event),
            point.x,
            point.y,
            point.screenX,
            point.screenY,
          );
        });
        element.addEventListener("pointermove", (event) => {
          if (pointerButtons === 0 && this.capturedWindow === 0) return;
          const target = this.capturedWindow || record.id;
          const point = this.pointerPoint(event, target);
          this.dispatchPointer(
            target,
            WM.MOUSEMOVE,
            pointerFlags(event),
            point.x,
            point.y,
            point.screenX,
            point.screenY,
          );
        });
        element.addEventListener("pointerup", (event) => {
          const message = event.button === 0
            ? WM.LBUTTONUP
            : event.button === 1
              ? WM.MBUTTONUP
              : WM.RBUTTONUP;
          const target = this.capturedWindow || record.id;
          const point = this.pointerPoint(event, target);
          this.dispatchPointer(
            target,
            message,
            pointerFlags(event),
            point.x,
            point.y,
            point.screenX,
            point.screenY,
          );
          pointerButtons &= ~(event.button === 0
            ? MK.LBUTTON
            : event.button === 1
              ? MK.MBUTTON
              : MK.RBUTTON);
        });
        (record.input ?? element).addEventListener("click", (event) => {
          if (record.input) {
            if (record.isThreeState) {
              event.preventDefault();
              record.checkState = (record.checkState + 1) % 3;
              this.syncControl(record);
            } else {
              record.checkState = record.input.checked ? 1 : 0;
            }
            if (record.input.type === "radio" && record.checkState === 1) {
              for (const siblingId of this.window(record.parent).children) {
                const sibling = this.window(siblingId);
                if (sibling.id !== record.id &&
                    sibling.radioGroup === record.radioGroup &&
                    sibling.input?.type === "radio") {
                  sibling.checkState = 0;
                  this.syncControl(sibling);
                }
              }
            }
          }
          dispatch(NOTIFY.BN_CLICKED);
        });
      }
      if (record.kind === CONTROL_KIND.edit ||
          record.kind === CONTROL_KIND["rich-edit"]) {
        element.addEventListener("input", () => {
          record.text = element.value;
          dispatch(NOTIFY.EN_CHANGE);
        });
        element.addEventListener("beforeinput", () => dispatch(NOTIFY.EN_UPDATE));
        element.addEventListener("blur", () => dispatch(NOTIFY.EN_KILLFOCUS));
      }
      if (record.kind === CONTROL_KIND["combo-box"]) {
        if (record.editableCombo) {
          element.addEventListener("input", () => {
            record.text = element.value;
            record.selectedItem = this.comboItemMatchingText(record, record.text);
            record.selectedItems = new Set(
              record.selectedItem >= 0 ? [record.selectedItem] : [],
            );
            dispatch(NOTIFY.CBN_EDITCHANGE);
          });
          element.addEventListener("change", () => {
            record.text = element.value;
            record.selectedItem = this.comboItemMatchingText(record, record.text);
            record.selectedItems = new Set(
              record.selectedItem >= 0 ? [record.selectedItem] : [],
            );
            if (record.selectedItem >= 0) {
              dispatch(NOTIFY.CBN_SELCHANGE);
              dispatch(NOTIFY.CBN_SELENDOK);
            }
          });
        } else {
          element.addEventListener("change", () => {
            this.readSelectionFromElement(record);
            record.text = record.items[record.selectedItem] ?? "";
            dispatch(NOTIFY.CBN_SELCHANGE);
            dispatch(NOTIFY.CBN_SELENDOK);
          });
        }
        element.addEventListener("blur", () => dispatch(NOTIFY.CBN_KILLFOCUS));
      }
      if (record.kind === CONTROL_KIND["list-box"]) {
        element.addEventListener("change", () => {
          this.readSelectionFromElement(record);
          dispatch(NOTIFY.LBN_SELCHANGE);
        });
        element.addEventListener("dblclick", () => dispatch(NOTIFY.LBN_DBLCLK));
      }
      if (record.kind === CONTROL_KIND.slider ||
          record.kind === CONTROL_KIND["scroll-bar"]) {
        element.addEventListener("input", () => {
          record.position = Number(element.value) | 0;
          this.dispatchWindowMessage(
            record.parent,
            record.kind === CONTROL_KIND["scroll-bar"] ? WM.VSCROLL : WM.HSCROLL,
            5,
            record.position,
            record.id,
          );
        });
        element.addEventListener("change", () => {
          record.position = Number(element.value) | 0;
          this.dispatchWindowMessage(
            record.parent,
            record.kind === CONTROL_KIND["scroll-bar"] ? WM.VSCROLL : WM.HSCROLL,
            4,
            record.position,
            record.id,
          );
        });
      }
      element.addEventListener("focus", () => {
        this.focusedWindow = record.id;
      });
    }

    setWindowText(windowId, value) {
      const record = this.window(windowId);
      record.text = String(value);
      if (record.element instanceof HTMLInputElement ||
          record.element instanceof HTMLTextAreaElement) {
        record.element.value = record.text;
      } else if (record.kind === CONTROL_KIND.static) {
        record.element.textContent = record.text;
      } else if (record.element instanceof HTMLButtonElement) {
        record.element.textContent = stripMnemonic(record.text);
      } else if (record.element?.matches(".wb-window")) {
        const title = record.element.querySelector(":scope > .wb-titlebar");
        const titleText = title?.querySelector(".wb-title-text");
        if (titleText) {
          titleText.textContent = record.text;
        } else if (title) {
          title.textContent = record.text;
        }
      }
    }

    getWindowText(windowId) {
      const record = this.window(windowId);
      if (record.element instanceof HTMLInputElement ||
          record.element instanceof HTMLTextAreaElement) {
        record.text = record.element.value;
      }
      return record.text;
    }

    syncControl(record) {
      if (!record.element) return;
      record.element.hidden = !record.visible;
      if ("disabled" in record.element) record.element.disabled = !record.enabled;
      if (record.input) record.input.disabled = !record.enabled;
      if (record.input) record.input.checked = record.checkState !== 0;
      if (record.element instanceof HTMLInputElement ||
          record.element instanceof HTMLTextAreaElement) {
        if (record.element.type !== "range") record.element.value = record.text;
      }
      if (record.element instanceof HTMLSelectElement || record.editableCombo) {
        this.renderSelect(record);
      }
      if (record.kind === CONTROL_KIND["list-control"]) this.renderListControl(record);
      if (record.kind === CONTROL_KIND["tree-control"]) this.renderTree(record);
    }

    insertItem(windowId, requestedIndex, value) {
      const record = this.window(windowId);
      const index = clamp(
        Number(requestedIndex) | 0,
        0,
        record.items.length,
      );
      record.items.splice(index, 0, String(value));
      record.itemData.splice(index, 0, 0);
      record.listRows.splice(index, 0, [String(value)]);
      if (record.selectedItem >= index) record.selectedItem += 1;
      record.selectedItems = new Set([...record.selectedItems].map(
        (item) => item >= index ? item + 1 : item,
      ));
      this.syncControl(record);
      return index;
    }

    deleteItem(windowId, requestedIndex) {
      const record = this.window(windowId);
      const index = Number(requestedIndex) | 0;
      if (index < 0 || index >= record.items.length) return -1;
      record.items.splice(index, 1);
      record.itemData.splice(index, 1);
      record.listRows.splice(index, 1);
      if (record.selectedItem === index) record.selectedItem = -1;
      else if (record.selectedItem > index) record.selectedItem -= 1;
      record.selectedItems = new Set([...record.selectedItems]
        .filter((item) => item !== index)
        .map((item) => item > index ? item - 1 : item));
      this.syncControl(record);
      return record.items.length;
    }

    resetItems(windowId) {
      const record = this.window(windowId);
      record.items = [];
      record.itemData = [];
      record.listRows = [];
      record.selectedItem = -1;
      record.selectedItems.clear();
      this.syncControl(record);
    }

    setSelectedItem(windowId, requestedIndex) {
      const record = this.window(windowId);
      const index = Number(requestedIndex) | 0;
      record.selectedItem = index >= 0 && index < record.items.length ? index : -1;
      record.selectedItems = new Set(
        record.selectedItem >= 0 ? [record.selectedItem] : [],
      );
      if (record.kind === CONTROL_KIND["combo-box"] && record.selectedItem >= 0) {
        record.text = record.items[record.selectedItem];
      }
      this.syncControl(record);
      return record.selectedItem;
    }

    setItemData(windowId, requestedIndex, value) {
      const record = this.window(windowId);
      const index = Number(requestedIndex) | 0;
      if (index < 0 || index >= record.items.length) return -1;
      record.itemData[index] = Number(value);
      return 0;
    }

    itemSelected(windowId, requestedIndex) {
      const record = this.window(windowId);
      const index = Number(requestedIndex) | 0;
      if (index < 0 || index >= record.items.length) return -1;
      return record.selectedItems.has(index) || record.selectedItem === index ? 1 : 0;
    }

    setItemSelected(windowId, requestedIndex, selected) {
      const record = this.window(windowId);
      const index = Number(requestedIndex) | 0;
      if (index === -1) {
        record.selectedItems = selected
          ? new Set(record.items.map((_, item) => item))
          : new Set();
      } else {
        if (index < 0 || index >= record.items.length) return -1;
        if (selected) record.selectedItems.add(index);
        else record.selectedItems.delete(index);
      }
      this.syncControl(record);
      return 0;
    }

    findItem(windowId, startAfter, value, exact) {
      const record = this.window(windowId);
      if (record.items.length === 0) return -1;
      const start = startAfter >= -1 && startAfter < record.items.length
        ? startAfter
        : -1;
      const needle = String(value).toLocaleLowerCase();
      for (let offset = 1; offset <= record.items.length; offset += 1) {
        const index = (start + offset) % record.items.length;
        const candidate = record.items[index].toLocaleLowerCase();
        if ((exact && candidate === needle) ||
            (!exact && candidate.startsWith(needle))) {
          return index;
        }
      }
      return -1;
    }

    renderSelect(record) {
      const element = record.element;
      if (record.editableCombo) {
        record.dataList.replaceChildren(...record.items.map((value) => {
          const option = document.createElement("option");
          option.value = value;
          return option;
        }));
        element.value = record.selectedItem >= 0
          ? record.items[record.selectedItem]
          : record.text;
        return;
      }
      element.replaceChildren(...record.items.map((value, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = value;
        option.selected = record.selectedItems.has(index) ||
          record.selectedItem === index;
        return option;
      }));
      if (!element.multiple) {
        element.selectedIndex = record.selectedItem >= 0
          ? record.selectedItem
          : -1;
      }
    }

    comboItemMatchingText(record, value) {
      const needle = String(value).toLocaleLowerCase();
      return record.items.findIndex(
        (item) => item.toLocaleLowerCase() === needle,
      );
    }

    readSelectionFromElement(record) {
      if (!(record.element instanceof HTMLSelectElement)) return;
      record.selectedItem = record.element.selectedIndex;
      record.selectedItems = new Set(
        [...record.element.selectedOptions].map((option) => Number(option.value)),
      );
    }

    insertListColumn(windowId, requestedIndex, heading, format, width, subItem) {
      const record = this.window(windowId);
      const index = clamp(Number(requestedIndex) | 0, 0, record.listColumns.length);
      record.listColumns.splice(index, 0, {
        heading: String(heading),
        format: Number(format) | 0,
        width: Number(width) | 0,
        subItem: Number(subItem) | 0,
      });
      this.renderListControl(record);
      return index;
    }

    setListItemText(windowId, requestedItem, requestedSubItem, value) {
      const record = this.window(windowId);
      const item = Number(requestedItem) | 0;
      const subItem = Number(requestedSubItem) | 0;
      if (item < 0 || item >= record.items.length || subItem < 0) return false;
      record.listRows[item] ??= [];
      record.listRows[item][subItem] = String(value);
      if (subItem === 0) record.items[item] = String(value);
      this.renderListControl(record);
      return true;
    }

    renderListControl(record) {
      if (!record.element) return;
      const table = document.createElement("table");
      table.className = "wb-list-table";
      if (record.listColumns.length > 0) {
        const row = document.createElement("tr");
        for (const column of record.listColumns) {
          const heading = document.createElement("th");
          heading.textContent = column.heading;
          heading.style.width = `${Math.max(0, column.width)}px`;
          row.append(heading);
        }
        const head = document.createElement("thead");
        head.append(row);
        table.append(head);
      }
      const body = document.createElement("tbody");
      record.listRows.forEach((values, item) => {
        const row = document.createElement("tr");
        row.dataset.item = String(item);
        row.classList.toggle(
          "selected",
          record.selectedItems.has(item) || record.selectedItem === item,
        );
        const count = Math.max(1, record.listColumns.length, values.length);
        for (let subItem = 0; subItem < count; subItem += 1) {
          const cell = document.createElement("td");
          cell.textContent = values[subItem] ?? "";
          row.append(cell);
        }
        row.addEventListener("click", () => {
          record.selectedItem = item;
          record.selectedItems = new Set([item]);
          this.renderListControl(record);
          this.dispatchNotify(
            record.parent,
            record.controlId,
            -2,
            record.id,
            item,
            record.itemData[item] ?? 0,
          );
        });
        row.addEventListener("dblclick", () => {
          this.dispatchNotify(
            record.parent,
            record.controlId,
            -3,
            record.id,
            item,
            record.itemData[item] ?? 0,
          );
        });
        body.append(row);
      });
      table.append(body);
      record.element.replaceChildren(table);
    }

    ensureListItemVisible(windowId, item) {
      const record = this.window(windowId);
      const row = record.element?.querySelector(`[data-item="${Number(item) | 0}"]`);
      row?.scrollIntoView({ block: "nearest" });
      return Boolean(row);
    }

    setCheckState(windowId, state) {
      const record = this.window(windowId);
      record.checkState = Number(state) | 0;
      if (record.input?.type === "radio" && record.checkState === 1) {
        for (const siblingId of this.window(record.parent).children) {
          const sibling = this.window(siblingId);
          if (sibling.id !== record.id &&
              sibling.radioGroup === record.radioGroup &&
              sibling.input?.type === "radio") {
            sibling.checkState = 0;
            this.syncControl(sibling);
          }
        }
      }
      if (record.input) {
        record.input.checked = record.checkState === 1;
        record.input.indeterminate = record.checkState === 2;
      }
    }

    setControlRange(windowId, minimum, maximum) {
      const record = this.window(windowId);
      record.minimum = Math.min(minimum, maximum) | 0;
      record.maximum = Math.max(minimum, maximum) | 0;
      if (record.element instanceof HTMLInputElement) {
        record.element.min = String(record.minimum);
        record.element.max = String(record.maximum);
      }
      this.setControlPosition(windowId, record.position);
    }

    setControlPosition(windowId, position) {
      const record = this.window(windowId);
      const previous = record.position;
      record.position = clamp(
        Number(position) | 0,
        record.minimum,
        record.maximum,
      );
      if (record.element instanceof HTMLInputElement) {
        record.element.value = String(record.position);
      }
      if (record.element instanceof HTMLProgressElement) {
        record.element.max = record.maximum;
        record.element.value = record.position;
      }
      return previous;
    }

    textSelection(windowId) {
      const record = this.window(windowId);
      const element = record.element;
      if (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement) {
        return {
          start: element.selectionStart ?? 0,
          end: element.selectionEnd ?? 0,
        };
      }
      return record.textSelection ?? { start: 0, end: 0 };
    }

    setTextSelection(windowId, requestedStart, requestedEnd) {
      const record = this.window(windowId);
      const length = this.getWindowText(windowId).length;
      const normalized = (value) => value < 0 ? length : clamp(value | 0, 0, length);
      let start = normalized(requestedStart);
      let end = normalized(requestedEnd);
      if (start > end) [start, end] = [end, start];
      record.textSelection = { start, end };
      if (record.element instanceof HTMLInputElement ||
          record.element instanceof HTMLTextAreaElement) {
        record.element.setSelectionRange(start, end);
      }
    }

    setRichTextFormat(method, windowId, faceName, numbers) {
      const record = this.window(windowId);
      const format = {
        faceName,
        mask: unsigned(numbers[0]),
        effects: unsigned(numbers[1]),
        heightTwips: Number(numbers[2]) | 0,
        verticalOffsetTwips: Number(numbers[3]) | 0,
        textColor: unsigned(numbers[4]),
        characterSet: unsigned(numbers[5]),
        pitchAndFamily: unsigned(numbers[6]),
      };
      if (method === "setRichEditDefaultFormat") {
        record.defaultTextFormat = format;
      } else {
        record.textFormatRuns ??= [];
        const selection = this.textSelection(windowId);
        record.textFormatRuns.push({
          start: selection.start,
          end: selection.end,
          format,
        });
      }
      if (record.element) {
        if (format.faceName) record.element.style.fontFamily = `"${format.faceName}", sans-serif`;
        if (format.heightTwips) {
          record.element.style.fontSize = `${Math.max(8, Math.abs(format.heightTwips) / 20)}pt`;
        }
        record.element.style.color = colorCss(format.textColor);
      }
      return true;
    }

    createViewElement() {
      const wrapper = document.createElement("div");
      wrapper.className = "wb-view-stack";
      const suppliedCanvas = this.module.canvas;
      const surface = !this.primaryRenderCanvas && suppliedCanvas instanceof HTMLCanvasElement
        ? suppliedCanvas
        : document.createElement("canvas");
      surface.className = "wb-view-surface";
      if (!surface.width) surface.width = 800;
      if (!surface.height) surface.height = 600;
      const overlay = document.createElement("canvas");
      overlay.className = "wb-view-overlay";
      overlay.width = 800;
      overlay.height = 600;
      wrapper.append(surface, overlay);
      wrapper.surface = surface;
      wrapper.overlay = overlay;
      return wrapper;
    }

    createCustomWindowElement(rect) {
      const wrapper = document.createElement("div");
      wrapper.className = "wb-custom-window";
      const surface = document.createElement("canvas");
      surface.className = "wb-view-surface";
      surface.width = Math.max(1, rectWidth(rect));
      surface.height = Math.max(1, rectHeight(rect));
      wrapper.append(surface);
      wrapper.surface = surface;
      wrapper.overlay = surface;
      return wrapper;
    }

    bindCanvasWindowInput(record, canOwnPrimaryRenderCanvas) {
      const wrapper = record.element;
      record.surface = wrapper.surface;
      record.overlay = wrapper.overlay;
      if (canOwnPrimaryRenderCanvas && !this.primaryRenderCanvas) {
        this.primaryRenderCanvas = record.surface;
        this.module.canvas = record.surface;
        record.renderKind = "3d";
        global.dispatchEvent(new CustomEvent("worldbuildercanvas", {
          detail: { canvas: record.surface, windowId: record.id },
        }));
      } else {
        record.renderKind = "2d";
      }
      let buttons = 0;
      const flags = (event) => buttons |
        (event.shiftKey ? MK.SHIFT : 0) |
        (event.ctrlKey ? MK.CONTROL : 0);
      wrapper.addEventListener("pointerdown", (event) => {
        try {
          wrapper.setPointerCapture(event.pointerId);
        } catch {
        }
        const buttonFlag = event.button === 0
          ? MK.LBUTTON
          : event.button === 1
            ? MK.MBUTTON
            : MK.RBUTTON;
        buttons |= buttonFlag;
        const message = event.button === 0
          ? WM.LBUTTONDOWN
          : event.button === 1
            ? WM.MBUTTONDOWN
            : WM.RBUTTONDOWN;
        const target = this.capturedWindow || record.id;
        const point = this.pointerPoint(event, target);
        this.dispatchPointer(
          target,
          message,
          flags(event),
          point.x,
          point.y,
          point.screenX,
          point.screenY,
        );
        event.preventDefault();
      });
      wrapper.addEventListener("pointermove", (event) => {
        const target = this.capturedWindow || record.id;
        const point = this.pointerPoint(event, target);
        this.dispatchPointer(
          target,
          WM.MOUSEMOVE,
          flags(event),
          point.x,
          point.y,
          point.screenX,
          point.screenY,
        );
      });
      wrapper.addEventListener("pointerup", (event) => {
        const message = event.button === 0
          ? WM.LBUTTONUP
          : event.button === 1
            ? WM.MBUTTONUP
            : WM.RBUTTONUP;
        const target = this.capturedWindow || record.id;
        const point = this.pointerPoint(event, target);
        this.dispatchPointer(
          target,
          message,
          flags(event),
          point.x,
          point.y,
          point.screenX,
          point.screenY,
        );
        buttons &= ~(event.button === 0
          ? MK.LBUTTON
          : event.button === 1
            ? MK.MBUTTON
            : MK.RBUTTON);
      });
      wrapper.addEventListener("contextmenu", (event) => event.preventDefault());
      const observer = new ResizeObserver(() => {
        const bounds = wrapper.getBoundingClientRect();
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        if (record.overlay.width !== width || record.overlay.height !== height) {
          record.overlay.width = width;
          record.overlay.height = height;
        }
        record.rect.right = record.rect.left + width;
        record.rect.bottom = record.rect.top + height;
        this.dispatchWindowMessage(record.id, WM.SIZE, 0, width, height);
      });
      observer.observe(wrapper);
      record.resizeObserver = observer;
    }

    paintContext(windowId) {
      const record = this.window(windowId);
      const canvas = record.renderKind === "3d" ? record.overlay : (record.surface ?? record.overlay);
      if (!canvas) return null;
      return canvas.getContext("2d");
    }

    beginPaint(windowId) {
      const record = this.window(windowId);
      const context = this.paintContext(windowId);
      if (!context) return;
      context.save();
      if (record.renderKind === "3d") {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      }
    }

    endPaint(windowId) {
      const record = this.window(windowId);
      const context = this.paintContext(windowId);
      if (context) context.restore();
      record.updateRect = null;
    }

    fillRectangle(windowId, rect, color) {
      const context = this.paintContext(windowId);
      if (!context) return;
      context.fillStyle = colorCss(color);
      context.fillRect(rect.left, rect.top, rectWidth(rect), rectHeight(rect));
    }

    drawLine(windowId, from, to, style) {
      const context = this.paintContext(windowId);
      if (!context) return;
      context.save();
      context.strokeStyle = colorCss(style.color);
      context.lineWidth = Math.max(1, style.penWidth);
      if (style.penStyle === 1) context.setLineDash([4, 3]);
      if (style.penStyle === 2) context.setLineDash([1, 2]);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.restore();
    }

    drawEllipse(windowId, bounds, style) {
      const context = this.paintContext(windowId);
      if (!context) return;
      context.save();
      context.strokeStyle = colorCss(style.penColor);
      context.lineWidth = Math.max(1, style.penWidth);
      context.beginPath();
      context.ellipse(
        (bounds.left + bounds.right) / 2,
        (bounds.top + bounds.bottom) / 2,
        rectWidth(bounds) / 2,
        rectHeight(bounds) / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (style.fill) {
        context.fillStyle = colorCss(style.fillColor);
        context.fill();
      }
      if (style.penStyle !== 5) context.stroke();
      context.restore();
    }

    drawPolygon(windowId, points, style) {
      if (points.length === 0) return;
      const context = this.paintContext(windowId);
      if (!context) return;
      context.save();
      context.strokeStyle = colorCss(style.penColor);
      context.fillStyle = colorCss(style.fillColor);
      context.lineWidth = Math.max(1, style.penWidth);
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.closePath();
      if (style.fill) context.fill();
      if (style.penStyle !== 5) context.stroke();
      context.restore();
    }

    drawText(windowId, value, bounds, style) {
      const context = this.paintContext(windowId);
      if (!context) return 0;
      context.save();
      const size = Math.max(8, Math.abs(style.fontHeight || 12));
      const weight = style.fontWeight >= 600 ? "bold" : "normal";
      const italic = style.fontItalic ? "italic" : "normal";
      context.font = `${italic} ${weight} ${size}px "${style.fontFace || "MS Sans Serif"}", sans-serif`;
      context.textBaseline = "top";
      context.fillStyle = style.textColorIsArgb
        ? argbCss(style.textColor)
        : colorCss(style.textColor);
      if (!style.transparentBackground) {
        context.fillStyle = colorCss(style.backgroundColor);
        context.fillRect(bounds.left, bounds.top, rectWidth(bounds), rectHeight(bounds));
        context.fillStyle = style.textColorIsArgb
          ? argbCss(style.textColor)
          : colorCss(style.textColor);
      }
      context.fillText(String(value), bounds.left, bounds.top);
      const width = Math.ceil(context.measureText(String(value)).width);
      context.restore();
      return width;
    }

    stretchDibits(windowId, destination, source, bytes, bitmap) {
      const context = this.paintContext(windowId);
      if (!context || ![24, 32].includes(bitmap.bitCount)) return 0;
      const width = Math.abs(bitmap.width);
      const height = Math.abs(bitmap.height);
      const stride = Math.ceil(width * bitmap.bitCount / 32) * 4;
      const image = context.createImageData(width, height);
      const bottomUp = bitmap.height > 0;
      for (let y = 0; y < height; y += 1) {
        const inputY = bottomUp ? height - 1 - y : y;
        for (let x = 0; x < width; x += 1) {
          const sourceOffset = inputY * stride + x * (bitmap.bitCount / 8);
          const outputOffset = (y * width + x) * 4;
          image.data[outputOffset] = bytes[sourceOffset + 2] ?? 0;
          image.data[outputOffset + 1] = bytes[sourceOffset + 1] ?? 0;
          image.data[outputOffset + 2] = bytes[sourceOffset] ?? 0;
          image.data[outputOffset + 3] = bitmap.bitCount === 32
            ? bytes[sourceOffset + 3]
            : 255;
        }
      }
      const scratch = document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      scratch.getContext("2d").putImageData(image, 0, 0);
      context.drawImage(
        scratch,
        source.left,
        source.top,
        rectWidth(source),
        rectHeight(source),
        destination.left,
        destination.top,
        rectWidth(destination),
        rectHeight(destination),
      );
      return height;
    }

    applyWindowRect(record) {
      if (!record.element || record.id === 1) return;
      record.element.style.left = `${record.rect.left}px`;
      record.element.style.top = `${record.rect.top}px`;
      record.element.style.width = `${rectWidth(record.rect)}px`;
      record.element.style.height = `${rectHeight(record.rect)}px`;
    }

    applyControlRect(record) {
      if (!record.element) return;
      record.element.style.left = `${record.rect.left}px`;
      record.element.style.top = `${record.rect.top}px`;
      record.element.style.width = `${rectWidth(record.rect)}px`;
      record.element.style.height = `${rectHeight(record.rect)}px`;
    }

    setWindowPosition(windowId, insertAfter, x, y, width, height, flags) {
      const record = this.window(windowId);
      const options = unsigned(flags);
      const previousWidth = rectWidth(record.rect);
      const previousHeight = rectHeight(record.rect);
      if (!(options & SWP.NOMOVE)) {
        record.rect.left = Number(x) | 0;
        record.rect.top = Number(y) | 0;
        record.rect.right = record.rect.left + previousWidth;
        record.rect.bottom = record.rect.top + previousHeight;
      }
      if (!(options & SWP.NOSIZE)) {
        record.rect.right = record.rect.left + Math.max(0, Number(width) | 0);
        record.rect.bottom = record.rect.top + Math.max(0, Number(height) | 0);
      }
      if (options & SWP.SHOWWINDOW) record.visible = true;
      if (options & SWP.HIDEWINDOW) record.visible = false;
      record.element.hidden = !record.visible;
      if (record.element?.matches(".wb-control, .wb-native-window")) {
        this.applyControlRect(record);
      } else {
        this.applyWindowRect(record);
      }
      if (!(options & SWP.NOZORDER) && insertAfter) {
        record.element.style.zIndex = insertAfter === 0xffffffff ? "1000" : "10";
      }
      if (!(options & SWP.NOREDRAW)) {
        const invalidateCanvasDescendants = (owner) => {
          if (owner.renderKind) {
            this.redrawWindow(owner.id, false, null, RDW.INVALIDATE);
          }
          for (const childId of owner.children) {
            const child = this.windows.get(childId);
            if (child) invalidateCanvasDescendants(child);
          }
        };
        invalidateCanvasDescendants(record);
      }
      return true;
    }

    redrawWindow(windowId, hasRect, rect, flags) {
      const record = this.window(windowId);
      const options = unsigned(flags);
      record.updateRect = hasRect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          }
        : {
          left: 0,
          top: 0,
          right: rectWidth(record.rect),
          bottom: rectHeight(record.rect),
        };
      record.paintGeneration = unsigned(record.paintGeneration ?? 0) + 1;
      if (options & RDW.UPDATENOW) {
        record.paintScheduled = false;
      } else if ((options & RDW.INVALIDATE) && !record.paintScheduled) {
        const generation = record.paintGeneration;
        record.paintScheduled = true;
        queueMicrotask(() => {
          if (!this.windows.has(record.id) ||
              (!record.paintScheduled && record.paintGeneration !== generation)) {
            return;
          }
          record.paintScheduled = false;
          this.dispatchWindowMessage(record.id, WM.PAINT, 0, 0, 0);
        });
      }
      return true;
    }

    setScrollRange(windowId, scrollBar, minimum, maximum) {
      const record = this.window(windowId);
      record.scrollRanges.set(Number(scrollBar) | 0, {
        minimum: Number(minimum) | 0,
        maximum: Number(maximum) | 0,
      });
    }

    setScrollPosition(windowId, scrollBar, position) {
      const record = this.window(windowId);
      const key = Number(scrollBar) | 0;
      const previous = record.scrollPositions.get(key) ?? 0;
      const range = record.scrollRanges.get(key) ?? { minimum: 0, maximum: 100 };
      record.scrollPositions.set(
        key,
        clamp(Number(position) | 0, range.minimum, range.maximum),
      );
      return previous;
    }

    scrollWindow(windowId, deltaX, deltaY) {
      const record = this.window(windowId);
      record.scrollDelta ??= { x: 0, y: 0 };
      record.scrollDelta.x += Number(deltaX) | 0;
      record.scrollDelta.y += Number(deltaY) | 0;
    }

    printWindow(windowId, preview) {
      const record = this.window(windowId);
      document.body.classList.toggle("wb-print-preview", Boolean(preview));
      record.element.classList.add("wb-print-target");
      global.print();
      record.element.classList.remove("wb-print-target");
    }

    showWindow(windowId, command) {
      const record = this.window(windowId);
      const previous = record.visible;
      record.visible = Number(command) !== SHOW.HIDE;
      record.minimized = SHOW.MINIMIZED.has(Number(command) | 0);
      record.element.hidden = !record.visible;
      record.element.classList.toggle("minimized", record.minimized);
      if (record.visible) {
        record.element.style.zIndex = String(100 + record.id);
      }
      return previous;
    }

    setEnabled(windowId, enabled) {
      const record = this.window(windowId);
      record.enabled = Boolean(enabled);
      record.element?.classList.toggle("disabled", !record.enabled);
      if (record.element && "disabled" in record.element) {
        record.element.disabled = !record.enabled;
      }
      if (record.input) record.input.disabled = !record.enabled;
    }

    insertTreeItem(treeId, parentValue, insertAfterValue, text, parameter, state, image, selectedImage) {
      const tree = this.window(treeId);
      const id = this.nextTreeItem++;
      const parent = this.normalizeTreeParent(parentValue);
      const node = {
        id,
        parent,
        text: String(text),
        parameter: Number(parameter),
        state: unsigned(state),
        image: Number(image) | 0,
        selectedImage: Number(selectedImage) | 0,
        children: [],
        expanded: Boolean(unsigned(state) & 0x0020),
      };
      tree.treeNodes.set(id, node);
      const siblings = parent
        ? this.treeNode(treeId, parent).children
        : tree.treeRoots;
      const insertAfter = unsigned(insertAfterValue);
      if (insertAfter === TREE_FIRST) {
        siblings.unshift(id);
      } else if (insertAfter === TREE_SORT) {
        siblings.push(id);
        siblings.sort((left, right) =>
          tree.treeNodes.get(left).text.localeCompare(tree.treeNodes.get(right).text));
      } else if (insertAfter && insertAfter !== TREE_LAST) {
        const position = siblings.indexOf(insertAfter);
        siblings.splice(position < 0 ? siblings.length : position + 1, 0, id);
      } else {
        siblings.push(id);
      }
      this.renderTree(tree);
      return id;
    }

    normalizeTreeParent(value) {
      const parent = unsigned(value);
      return parent === TREE_ROOT ? 0 : parent;
    }

    treeNode(treeId, itemId, required = true) {
      const tree = this.window(treeId);
      const node = tree.treeNodes.get(unsigned(itemId));
      if (!node && required) {
        throw new Error(`Unknown tree item ${unsigned(itemId)} in ${unsigned(treeId)}`);
      }
      return node;
    }

    writeTreeItem(treeId, itemId, mask, text, parameter, state, stateMask, image, selectedImage) {
      const node = this.treeNode(treeId, itemId, false);
      if (!node) return false;
      const flags = unsigned(mask);
      if (flags & TVIF.TEXT) node.text = String(text);
      if (flags & TVIF.PARAM) node.parameter = Number(parameter);
      if (flags & TVIF.STATE) {
        node.state = (node.state & ~unsigned(stateMask)) |
          (unsigned(state) & unsigned(stateMask));
        node.expanded = Boolean(node.state & 0x0020);
      }
      if (flags & TVIF.IMAGE) node.image = Number(image) | 0;
      if (flags & TVIF.SELECTED_IMAGE) node.selectedImage = Number(selectedImage) | 0;
      this.renderTree(this.window(treeId));
      return true;
    }

    firstTreeChild(treeId, parentValue) {
      const tree = this.window(treeId);
      const parent = this.normalizeTreeParent(parentValue);
      const children = parent ? this.treeNode(treeId, parent).children : tree.treeRoots;
      return children[0] ?? 0;
    }

    nextTreeSibling(treeId, itemId) {
      const tree = this.window(treeId);
      const node = this.treeNode(treeId, itemId);
      const siblings = node.parent
        ? this.treeNode(treeId, node.parent).children
        : tree.treeRoots;
      const index = siblings.indexOf(node.id);
      return index >= 0 ? siblings[index + 1] ?? 0 : 0;
    }

    deleteTreeItem(treeId, itemId) {
      const tree = this.window(treeId);
      const node = this.treeNode(treeId, itemId, false);
      if (!node) return false;
      const removeRecursively = (id) => {
        const current = tree.treeNodes.get(id);
        for (const child of current?.children ?? []) removeRecursively(child);
        tree.treeNodes.delete(id);
      };
      const siblings = node.parent
        ? this.treeNode(treeId, node.parent).children
        : tree.treeRoots;
      siblings.splice(siblings.indexOf(node.id), 1);
      removeRecursively(node.id);
      if (tree.treeSelected === node.id) tree.treeSelected = 0;
      this.renderTree(tree);
      return true;
    }

    deleteAllTreeItems(treeId) {
      const tree = this.window(treeId);
      tree.treeNodes.clear();
      tree.treeRoots = [];
      tree.treeSelected = 0;
      this.renderTree(tree);
    }

    selectTreeItem(treeId, itemId) {
      const tree = this.window(treeId);
      const id = unsigned(itemId);
      if (id && !tree.treeNodes.has(id)) return false;
      const previous = tree.treeSelected;
      tree.treeSelected = id;
      this.renderTree(tree);
      if (id !== previous) {
        const node = this.treeNode(treeId, id, false);
        this.dispatchNotify(
          tree.parent,
          tree.controlId,
          -402,
          tree.id,
          id,
          node?.parameter ?? 0,
          0,
          node?.text ?? "",
        );
      }
      return true;
    }

    setTreeFirstVisibleItem(treeId, itemId) {
      const tree = this.window(treeId);
      const element = tree.element?.querySelector(`[data-tree-item="${unsigned(itemId)}"]`);
      element?.scrollIntoView({ block: "start" });
      return Boolean(element);
    }

    renderTree(tree) {
      if (!tree.element) return;
      const appendImage = (row, listType, imageIndex) => {
        const listId = tree.imageLists?.get(listType);
        const list = this.imageLists.get(unsigned(listId));
        if (!list || imageIndex < 0) return;
        const icon = document.createElement("span");
        icon.className = "wb-tree-icon";
        icon.style.width = `${Math.max(1, list.width || 16)}px`;
        icon.style.height = `${Math.max(1, list.height || 16)}px`;
        const loaded = this.images.get(unsigned(list.images?.[imageIndex]));
        if (loaded) {
          icon.style.backgroundImage = `url("${loaded.url}")`;
          icon.style.backgroundSize = "contain";
        } else if (list.bitmapResourceId) {
          const bitmapId = list.loadedBitmapId ??=
            this.loadImage(list.bitmapResourceId, 0, 0, 0, 0);
          const bitmap = this.images.get(bitmapId);
          if (bitmap) {
            icon.style.backgroundImage = `url("${bitmap.url}")`;
            icon.style.backgroundPosition = `${-imageIndex * list.width}px 0`;
          }
        }
        row.append(icon);
      };
      const renderNode = (itemId) => {
        const node = tree.treeNodes.get(itemId);
        const item = document.createElement("li");
        item.dataset.treeItem = String(node.id);
        item.setAttribute("role", "treeitem");
        item.setAttribute("aria-selected", String(tree.treeSelected === node.id));
        item.classList.toggle("selected", tree.treeSelected === node.id);
        item.classList.toggle("drop-target", tree.treeDropTarget === node.id);
        const row = document.createElement("div");
        row.className = "wb-tree-row";
        if (node.children.length > 0) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "wb-tree-toggle";
          toggle.textContent = node.expanded ? "−" : "+";
          toggle.addEventListener("click", (event) => {
            node.expanded = !node.expanded;
            node.state = node.expanded ? node.state | 0x0020 : node.state & ~0x0020;
            this.renderTree(tree);
            this.dispatchNotify(
              tree.parent,
              tree.controlId,
              -406,
              tree.id,
              node.id,
              node.parameter,
              node.expanded ? 2 : 1,
              node.text,
            );
            event.stopPropagation();
          });
          row.append(toggle);
        } else {
          const spacer = document.createElement("span");
          spacer.className = "wb-tree-toggle-spacer";
          row.append(spacer);
        }
        appendImage(row, 0, node.image);
        const stateImage = ((unsigned(node.state) >>> 12) & 0x0f) - 1;
        appendImage(row, 2, stateImage);
        const label = document.createElement("span");
        label.className = "wb-tree-label";
        label.textContent = node.text;
        row.append(label);
        row.addEventListener("click", () => {
          tree.treeSelected = node.id;
          this.renderTree(tree);
          this.dispatchNotify(
            tree.parent,
            tree.controlId,
            -402,
            tree.id,
            node.id,
            node.parameter,
            0,
            node.text,
          );
        });
        row.addEventListener("dblclick", () => {
          node.expanded = !node.expanded;
          this.renderTree(tree);
          this.dispatchNotify(
            tree.parent,
            tree.controlId,
            -3,
            tree.id,
            node.id,
            node.parameter,
            0,
            node.text,
          );
        });
        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const point = this.pointerPoint(event, tree.id);
          console.debug("[world-builder] tree context menu requested", {
            tree: tree.id,
            item: node.id,
            point,
          });
          this.dispatchPointer(
            tree.id,
            WM.RBUTTONDOWN,
            MK.RBUTTON,
            point.x,
            point.y,
            point.screenX,
            point.screenY,
          );
        });
        row.draggable = true;
        row.addEventListener("dragstart", () => {
          this.dispatchNotify(
            tree.parent,
            tree.controlId,
            -407,
            tree.id,
            node.id,
            node.parameter,
            0,
            node.text,
          );
        });
        row.addEventListener("dragover", (event) => {
          event.preventDefault();
          const parent = this.window(tree.parent).element.getBoundingClientRect();
          this.dispatchPointer(
            tree.parent,
            WM.MOUSEMOVE,
            MK.LBUTTON,
            event.clientX - parent.left,
            event.clientY - parent.top,
          );
        });
        row.addEventListener("drop", (event) => {
          event.preventDefault();
          const parent = this.window(tree.parent).element.getBoundingClientRect();
          this.dispatchPointer(
            tree.parent,
            WM.LBUTTONUP,
            0,
            event.clientX - parent.left,
            event.clientY - parent.top,
          );
        });
        item.append(row);
        if (node.children.length > 0 && node.expanded) {
          const list = document.createElement("ul");
          list.setAttribute("role", "group");
          list.append(...node.children.map(renderNode));
          item.append(list);
        }
        return item;
      };
      const root = document.createElement("ul");
      root.className = "wb-tree-root";
      root.setAttribute("role", "tree");
      root.append(...tree.treeRoots.map(renderNode));
      tree.element.replaceChildren(root);
    }

    hitTestTreeItem(treeId, x, y) {
      const tree = this.window(treeId);
      const bounds = tree.element.getBoundingClientRect();
      const element = document.elementFromPoint(bounds.left + x, bounds.top + y)
        ?.closest("[data-tree-item]");
      return {
        item: Number(element?.dataset.treeItem ?? 0),
        flags: element ? 0x0046 : 0x0001,
      };
    }

    beginTreeLabelEdit(treeId, itemId) {
      const tree = this.window(treeId);
      const node = this.treeNode(treeId, itemId);
      this.dispatchNotify(
        tree.parent,
        tree.controlId,
        -410,
        tree.id,
        node.id,
        node.parameter,
        0,
        node.text,
      );
      const label = tree.element.querySelector(
        `[data-tree-item="${node.id}"] > .wb-tree-row > .wb-tree-label`,
      );
      if (!label) return 0;
      const input = document.createElement("input");
      input.type = "text";
      input.value = node.text;
      label.replaceWith(input);
      const record = this.allocateWindow({
        parent: tree.id,
        controlId: 0,
        kind: CONTROL_KIND.edit,
        className: "TreeLabelEdit",
        rect: { left: 0, top: 0, right: 120, bottom: 20 },
        text: node.text,
        visible: true,
        element: input,
      });
      tree.treeLabelEdit = { window: record.id, item: node.id, input };
      this.bindControlEvents(record, input);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.endTreeLabelEdit(tree.id, false);
        } else if (event.key === "Escape") {
          event.preventDefault();
          this.endTreeLabelEdit(tree.id, true);
        }
      });
      input.addEventListener("blur", () => {
        if (tree.treeLabelEdit) this.endTreeLabelEdit(tree.id, false);
      });
      input.focus();
      input.select();
      return record.id;
    }

    endTreeLabelEdit(treeId, cancel) {
      const tree = this.window(treeId);
      const edit = tree.treeLabelEdit;
      if (!edit) return false;
      const node = this.treeNode(treeId, edit.item);
      const text = edit.input.value;
      if (!cancel) {
        node.text = text;
        this.dispatchNotify(
          tree.parent,
          tree.controlId,
          -411,
          tree.id,
          node.id,
          node.parameter,
          0,
          text,
        );
      }
      tree.treeLabelEdit = null;
      this.destroyWindow(edit.window);
      this.renderTree(tree);
      return true;
    }

    createImageList(width, height, flags, initialCount, growCount) {
      const id = this.nextImageList++;
      this.imageLists.set(id, {
        id,
        width: Number(width) | 0,
        height: Number(height) | 0,
        flags: unsigned(flags),
        initialCount: Number(initialCount) | 0,
        growCount: Number(growCount) | 0,
        images: [],
      });
      return id;
    }

    createImageListFromBitmap(resourceId, cellWidth, growCount, transparentColor) {
      const id = this.createImageList(cellWidth, 0, 0, 1, growCount);
      const list = this.imageLists.get(id);
      list.bitmapResourceId = unsigned(resourceId);
      list.transparentColor = unsigned(transparentColor);
      return id;
    }

    addImageListIcon(imageListId, iconId) {
      const list = this.imageLists.get(unsigned(imageListId));
      if (!list) return -1;
      list.images.push(unsigned(iconId));
      return list.images.length - 1;
    }

    createStatusBar(parent) {
      const parentRecord = this.window(parent);
      const element = document.createElement("footer");
      element.className = "wb-statusbar";
      const record = this.allocateWindow({
        parent,
        kind: CONTROL_KIND["status-bar"],
        className: "StatusBar",
        rect: { left: 0, top: 0, right: 800, bottom: 22 },
        visible: true,
        element,
      });
      (parentRecord.statusChrome ?? parentRecord.chrome ?? parentRecord.element)
        .append(element);
      return record.id;
    }

    renderStatusBar(record) {
      record.element.replaceChildren(...(record.indicators ?? []).map((indicator, index) => {
        const pane = document.createElement("span");
        pane.className = "wb-status-pane";
        pane.dataset.indicator = String(indicator);
        pane.textContent = index === 0 ? (record.message ?? "Ready") : "";
        return pane;
      }));
    }

    createToolBar(parent, controlStyle, barStyle) {
      const parentRecord = this.window(parent);
      const element = document.createElement("div");
      element.className = "wb-toolbar";
      element.setAttribute("role", "toolbar");
      const record = this.allocateWindow({
        parent,
        kind: CONTROL_KIND.toolbar,
        className: "ToolBar",
        style: barStyle,
        rect: { left: 0, top: 0, right: 800, bottom: 32 },
        visible: true,
        element,
      });
      record.controlStyle = unsigned(controlStyle);
      (parentRecord.chrome ?? parentRecord.element).append(element);
      return record.id;
    }

    loadToolBarResource(toolbarId, resourceId) {
      const record = this.window(toolbarId);
      const resource = this.resourcesByToolbar.get(unsigned(resourceId));
      if (!resource) return false;
      record.toolbarResource = resource;
      const toolbarImageId = this.loadImage(resourceId, 0, 0, 0, 0);
      const toolbarImage = this.images.get(toolbarImageId);
      let imageIndex = 0;
      const buttons = resource.items.map((item) => {
        if (item.type === "separator") {
          const separator = document.createElement("span");
          separator.className = "wb-toolbar-separator";
          return separator;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wb-toolbar-button";
        button.dataset.commandId = String(item.value);
        const tooltip = this.resourcesByString.get(unsigned(item.value)) ?? item.id;
        const [status, label] = tooltip.split("\n");
        button.title = label || status || item.id;
        button.setAttribute("aria-label", label || item.id);
        if (toolbarImage) {
          const icon = document.createElement("span");
          icon.className = "wb-toolbar-icon";
          icon.style.width = `${resource.buttonWidth}px`;
          icon.style.height = `${resource.buttonHeight}px`;
          icon.style.backgroundImage = `url("${toolbarImage.url}")`;
          icon.style.backgroundPosition = `${-imageIndex * resource.buttonWidth}px 0`;
          button.append(icon);
        } else {
          button.textContent = this.toolbarGlyph(item.id);
        }
        imageIndex += 1;
        button.addEventListener("click", () => this.dispatchCommand(this.mainFrame, item.value));
        return button;
      });
      record.element.replaceChildren(...buttons);
      this.refreshCommandElements(this.mainFrame, record.element);
      return true;
    }

    toolbarGlyph(id) {
      const words = String(id)
        .replace(/^ID_/, "")
        .replace(/_TOOL$/, "")
        .split("_");
      const known = {
        FILE_NEW: "▧",
        FILE_OPEN: "▱",
        FILE_SAVE: "▣",
        EDIT_CUT: "✂",
        EDIT_COPY: "⧉",
        EDIT_PASTE: "▤",
        POINTER: "↖",
        BRUSH: "●",
        WATER: "≈",
        ROAD: "⌁",
        WAYPOINT: "◇",
        POLYGON: "⬡",
        SCRIPT_EDIT: "S",
        TEAM_EDIT: "T",
        APP_ABOUT: "?",
      };
      return known[words.join("_")] ??
        known[words.slice(0, 2).join("_")] ??
        words.map((word) => word[0]).join("").slice(0, 2);
    }

    dockControlBar(frameId, barId) {
      const frame = this.window(frameId);
      const bar = this.window(barId);
      bar.element.classList.add("docked");
      (frame.chrome ?? frame.element).append(bar.element);
    }

    floatControlBar(frameId, barId, x, y, alignment) {
      const bar = this.window(barId);
      bar.dockingAlignment = unsigned(alignment);
      bar.element.classList.remove("docked");
      bar.rect.left = Number(x) | 0;
      bar.rect.top = Number(y) | 0;
      this.windowLayer.append(bar.element);
      this.applyWindowRect(bar);
    }

    saveBarState(frameId, profileName) {
      const frame = this.window(frameId);
      const state = frame.children
        .map((id) => this.window(id))
        .filter((record) => record.kind === CONTROL_KIND.toolbar)
        .map(({ id, rect, visible }) => ({ id, rect, visible }));
      localStorage.setItem(
        profileKey("Bars", profileName),
        JSON.stringify(state),
      );
    }

    setFrameMessage(frameId, message) {
      const frame = this.window(frameId);
      const status = frame.children
        .map((id) => this.window(id))
        .find(({ kind }) => kind === CONTROL_KIND["status-bar"]);
      if (!status) return;
      status.message = String(message);
      this.renderStatusBar(status);
    }

    applyRecentFiles(items) {
      const fileMenu = items.find((item) =>
        item.type === "popup" &&
        splitMenuLabel(item.label).label === "File");
      if (!fileMenu) return;
      const placeholder = fileMenu.items.findIndex((item) =>
        item.type === "command" && unsigned(item.value) === 0xe110);
      if (placeholder < 0) return;
      const replacements = (this.recentFiles ?? []).slice(0, 4)
        .map((path, index) => ({
          type: "command",
          id: `ID_FILE_MRU_FILE${index + 1}`,
          value: 0xe110 + index,
          label: `&${index + 1} ${path}`,
          flags: "",
        }));
      if (replacements.length === 0) {
        replacements.push({
          type: "command",
          id: "ID_FILE_MRU_FILE1",
          value: 0xe110,
          label: "Recent File",
          flags: "",
        });
      }
      fileMenu.items.splice(placeholder, 1, ...replacements);
    }

    setRecentFiles(paths) {
      this.recentFiles = [...new Set(
        (paths ?? []).map((path) => String(path)).filter(Boolean),
      )].slice(0, 4);
      const frame = this.windows.get(unsigned(this.mainFrame));
      if (!frame?.menuElement || !frame.resourceId) return;
      const resource = this.resourcesByMenu.get(unsigned(frame.resourceId));
      if (!resource) return;
      frame.menuItems = structuredClone(resource.items);
      this.applyRecentFiles(frame.menuItems);
      this.renderFrameMenu(frame, frame.menuItems);
    }

    renderFrameMenu(frame, items) {
      const renderItems = (menuItems, nested = false) => {
        const list = document.createElement("ul");
        list.className = nested ? "wb-menu-popup" : "wb-menu-root";
        list.setAttribute("role", "menu");
        for (const item of menuItems) {
          const entry = document.createElement("li");
          if (item.type === "separator") {
            entry.className = "wb-menu-separator";
            entry.setAttribute("role", "separator");
          } else if (item.type === "popup") {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "wb-menu-heading";
            button.textContent = splitMenuLabel(item.label).label;
            button.addEventListener("pointerenter", () => {
              if (nested) entry.classList.add("open");
            });
            button.addEventListener("click", () => {
              const opening = !entry.classList.contains("open");
              entry.classList.toggle("open");
              if (!nested && opening) this.updateMenuState(frame.id, entry);
            });
            entry.append(button, renderItems(item.items, true));
          } else {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.commandId = String(item.value);
            button.setAttribute("role", "menuitem");
            const { label, accelerator } = splitMenuLabel(item.label);
            const text = document.createElement("span");
            text.textContent = label;
            const key = document.createElement("kbd");
            key.textContent = accelerator;
            button.append(text, key);
            button.disabled = /\bGRAYED\b|\bINACTIVE\b/i.test(item.flags);
            button.addEventListener("click", () => {
              frame.menuElement.querySelectorAll(".open")
                .forEach((element) => element.classList.remove("open"));
              this.dispatchCommand(frame.id, item.value);
            });
            entry.append(button);
          }
          list.append(entry);
        }
        return list;
      };
      frame.menuElement.replaceChildren(renderItems(items));
    }

    updateMenuState(frameId, root) {
      this.refreshCommandElements(frameId, root);
    }

    refreshCommandElements(frameId, root) {
      for (const button of root.querySelectorAll("[data-command-id]")) {
        const command = Number(button.dataset.commandId);
        const state = this.updateCommand(frameId, command);
        if (!state) continue;
        button.disabled = !state.enabled;
        button.classList.toggle("checked", Boolean(state.checked));
        if (state.text) {
          const label = button.querySelector("span");
          if (label) label.textContent = stripMnemonic(state.text);
        }
      }
    }

    refreshToolBarCommands(frameId) {
      for (const record of this.windows.values()) {
        if (
          record.toolbarResource &&
          record.visible &&
          record.element?.isConnected
        ) {
          this.refreshCommandElements(frameId, record.element);
        }
      }
    }

    refreshCommandIds(frameId, commandIds) {
      const frame = this.window(frameId);
      for (const commandId of new Set([...commandIds].map(unsigned))) {
        const state = this.updateCommand(frameId, commandId);
        if (!state) continue;
        for (const button of frame.element.querySelectorAll(
          `[data-command-id="${commandId}"]`,
        )) {
          button.disabled = !state.enabled;
          button.classList.toggle("checked", Boolean(state.checked));
        }
      }
    }

    loadMenuResource(resourceId) {
      const resource = this.resourcesByMenu.get(unsigned(resourceId));
      if (!resource) return 0;
      const id = this.nextMenu++;
      this.menus.set(id, structuredClone(resource.items));
      return id;
    }

    submenu(menuId, position) {
      const items = this.menus.get(unsigned(menuId));
      const popup = items?.[Number(position) | 0];
      if (!popup || popup.type !== "popup") return 0;
      const id = this.nextMenu++;
      this.menus.set(id, popup.items);
      return id;
    }

    appendMenuItem(menuId, flags, commandOrSubmenu, text) {
      const items = this.menus.get(unsigned(menuId));
      if (!items) return false;
      if (unsigned(flags) & 0x00000800) {
        items.push({ type: "separator" });
      } else if (unsigned(flags) & 0x00000010) {
        items.push({
          type: "popup",
          label: text,
          items: this.menus.get(unsigned(commandOrSubmenu)) ?? [],
          flags: "",
        });
      } else {
        items.push({
          type: "command",
          id: "",
          value: unsigned(commandOrSubmenu),
          label: text,
          flags: "",
        });
      }
      return true;
    }

    menuItem(menuId, requestedItem, flags) {
      const items = this.menus.get(unsigned(menuId));
      if (!items) return { items: null, index: -1, item: null };
      const byPosition = Boolean(unsigned(flags) & 0x00000400);
      const index = byPosition
        ? Number(requestedItem) | 0
        : items.findIndex(({ value }) => unsigned(value) === unsigned(requestedItem));
      return { items, index, item: items[index] };
    }

    removeMenuItem(menuId, item, flags) {
      const found = this.menuItem(menuId, item, flags);
      if (!found.item) return false;
      found.items.splice(found.index, 1);
      return true;
    }

    enableMenuItem(menuId, item, flags) {
      const found = this.menuItem(menuId, item, flags);
      if (!found.item) return -1;
      const previous = found.item.disabled ? 1 : 0;
      found.item.disabled = Boolean(unsigned(flags) & 0x00000003);
      return previous;
    }

    checkMenuItem(menuId, item, flags) {
      const found = this.menuItem(menuId, item, flags);
      if (!found.item) return -1;
      const previous = found.item.checked ? 8 : 0;
      found.item.checked = Boolean(unsigned(flags) & 0x00000008);
      return previous;
    }

    trackPopupMenu(menuId, flags, x, y, owner) {
      void this.trackPopupMenuAsync(menuId, flags, x, y, owner).then((command) => {
        if (command && !(unsigned(flags) & 0x0100)) {
          this.dispatchCommand(owner, command);
        }
      });
      return 0;
    }

    async trackPopupMenuAsync(menuId, flags, x, y) {
      const items = this.menus.get(unsigned(menuId));
      if (!items) return 0;
      console.debug("[world-builder] opening original popup menu", {
        menuId: unsigned(menuId),
        flags: unsigned(flags),
        x,
        y,
        items: items.length,
      });
      this.desktop.querySelectorAll(".wb-context-menu").forEach((element) => element.remove());
      const popup = document.createElement("div");
      popup.className = "wb-context-menu";
      const desktopBounds = this.desktop.getBoundingClientRect();
      popup.style.left = `${Math.max(0, x - desktopBounds.left)}px`;
      popup.style.top = `${Math.max(0, y - desktopBounds.top)}px`;
      this.desktop.append(popup);
      return await new Promise((resolve) => {
        let finished = false;
        const finish = (command) => {
          if (finished) return;
          finished = true;
          document.removeEventListener("pointerdown", onOutside, true);
          document.removeEventListener("keydown", onKeyDown, true);
          popup.remove();
          resolve(unsigned(command));
        };
        const renderItems = (menuItems, parent) => {
          for (const item of menuItems) {
            if (item.type === "separator") {
              parent.append(document.createElement("hr"));
              continue;
            }
            if (item.type === "popup") {
              const nested = document.createElement("details");
              nested.className = "wb-context-submenu";
              const summary = document.createElement("summary");
              summary.textContent = splitMenuLabel(item.label).label;
              const content = document.createElement("div");
              renderItems(item.items ?? [], content);
              nested.append(summary, content);
              parent.append(nested);
              continue;
            }
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `${item.checked ? "✓ " : ""}${
              splitMenuLabel(item.label).label
            }`;
            button.disabled = Boolean(item.disabled);
            button.addEventListener("click", () => finish(item.value));
            parent.append(button);
          }
        };
        const onOutside = (event) => {
          if (!popup.contains(event.target)) finish(0);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish(0);
          }
        };
        renderItems(items, popup);
        queueMicrotask(() => {
          const maximumLeft = Math.max(
            0,
            this.desktop.clientWidth - popup.offsetWidth,
          );
          const maximumTop = Math.max(
            0,
            this.desktop.clientHeight - popup.offsetHeight,
          );
          popup.style.left = `${
            Math.min(maximumLeft, Math.max(0, Number.parseFloat(popup.style.left)))
          }px`;
          popup.style.top = `${
            Math.min(maximumTop, Math.max(0, Number.parseFloat(popup.style.top)))
          }px`;
          document.addEventListener("pointerdown", onOutside, true);
          document.addEventListener("keydown", onKeyDown, true);
          popup.querySelector("button:not([disabled])")?.focus();
        });
      });
    }

    destroyWindow(windowId) {
      const record = this.windows.get(unsigned(windowId));
      if (!record) return false;
      record.destroying = true;
      for (const child of [...record.children]) this.destroyWindow(child);
      record.resizeObserver?.disconnect();
      if (this.capturedWindow === record.id) this.capturedWindow = 0;
      if (this.focusedWindow === record.id) {
        this.focusedWindow = record.parent || this.mainFrame || 0;
      }
      record.element?.remove();
      record.dataList?.remove();
      this.windows.delete(record.id);
      if (record.parent) {
        const parent = this.windows.get(record.parent);
        if (parent) parent.children = parent.children.filter((id) => id !== record.id);
      }
      const key = controlKey(record.parent, record.controlId);
      if (this.controls.get(key) === record.id) this.controls.delete(key);
      return true;
    }

    setTimer(windowId, eventId, milliseconds) {
      const assignedEvent = unsigned(eventId) || this.nextTimerEvent++;
      const key = `${unsigned(windowId)}:${assignedEvent}`;
      this.killTimer(windowId, assignedEvent);
      const handle = global.setInterval(() => {
        this.dispatchWindowMessage(windowId, WM.TIMER, assignedEvent, 0, 0);
      }, Math.max(1, Number(milliseconds) | 0));
      this.timers.set(key, handle);
      return assignedEvent;
    }

    killTimer(windowId, eventId) {
      const key = `${unsigned(windowId)}:${unsigned(eventId)}`;
      const handle = this.timers.get(key);
      if (handle === undefined) return false;
      global.clearInterval(handle);
      this.timers.delete(key);
      return true;
    }

    deliverNativeMessage(windowId, message, wParam, lParam) {
      const record = this.windows.get(unsigned(windowId));
      // Win32 drops messages addressed to an HWND after DestroyWindow. DOM
      // blur/input notifications can already be queued when a label editor is
      // destroyed, so preserve that stale-handle behavior here.
      if (!record || record.destroying) return 0;
      if (unsigned(message) === 0x00f7) {
        const previous = record.image ?? 0;
        record.image = unsigned(lParam);
        const image = this.images.get(record.image);
        if (image && record.element) {
          const element = document.createElement("img");
          element.className = "wb-control-image";
          element.alt = "";
          element.src = image.url;
          if (record.input) {
            record.element.querySelector(".wb-control-image")?.remove();
            record.element.append(element);
          } else {
            record.element.replaceChildren(element);
          }
        }
        return previous;
      }
      return 0;
    }

    setFocus(windowId) {
      const record = this.window(windowId);
      this.focusedWindow = record.id;
      record.input?.focus();
      record.element?.focus?.();
    }

    runModal(dialogId) {
      const record = this.window(dialogId);
      record.visible = true;
      record.element.hidden = false;
      record.element.classList.add("modal");
      this.modalLayer.hidden = false;
      this.modalLayer.append(record.element);
      const first = record.element.querySelector(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      );
      first?.focus();
      return record.modalResult || 0;
    }

    async runMessageBox({ text, caption, type }) {
      const buttonSets = {
        0: [["OK", 1]],
        1: [["OK", 1], ["Cancel", 2]],
        2: [["Abort", 3], ["Retry", 4], ["Ignore", 5]],
        3: [["Yes", 6], ["No", 7], ["Cancel", 2]],
        4: [["Yes", 6], ["No", 7]],
        5: [["Retry", 4], ["Cancel", 2]],
        6: [["Cancel", 2], ["Try Again", 10], ["Continue", 11]],
      };
      const buttons = buttonSets[unsigned(type) & 0x0f] ?? buttonSets[0];
      const defaultIndex = clamp((unsigned(type) >>> 8) & 0x03, 0, buttons.length - 1);
      const dialog = document.createElement("section");
      dialog.className = "wb-message-box";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", String(caption || "World Builder"));
      const title = document.createElement("header");
      title.className = "wb-titlebar";
      title.textContent = String(caption || "World Builder");
      const body = document.createElement("p");
      body.className = "wb-message-box-copy";
      body.textContent = String(text || "");
      const actions = document.createElement("footer");
      actions.className = "wb-message-box-actions";
      dialog.append(title, body, actions);
      this.modalLayer.hidden = false;
      this.modalLayer.append(dialog);
      return await new Promise((resolve) => {
        let finished = false;
        const finish = (result) => {
          if (finished) return;
          finished = true;
          document.removeEventListener("keydown", onKeyDown, true);
          dialog.remove();
          this.modalLayer.hidden =
            !this.modalLayer.querySelector(".modal:not([hidden]), .wb-message-box");
          resolve(result);
        };
        const cancelButton = buttons.find(([, result]) => result === 2);
        const onKeyDown = (event) => {
          if (event.key === "Escape" && cancelButton) {
            event.preventDefault();
            event.stopPropagation();
            finish(2);
          }
        };
        buttons.forEach(([label, result], index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.addEventListener("click", () => finish(result));
          actions.append(button);
          if (index === defaultIndex) queueMicrotask(() => button.focus());
        });
        document.addEventListener("keydown", onKeyDown, true);
      });
    }

    closeDialog(dialogId, result) {
      const record = this.window(dialogId);
      record.modalResult = Number(result) | 0;
      record.visible = false;
      record.element.hidden = true;
      record.element.classList.remove("modal");
      this.windowLayer.append(record.element);
      this.modalLayer.hidden = !this.modalLayer.querySelector(".modal:not([hidden])");
    }

    createPropertySheet(caption, parent) {
      const id = this.createDialog(0, parent);
      const record = this.window(id);
      record.text = caption;
      record.propertyPages = [];
      record.element.classList.add("wb-property-sheet");
      record.propertyTabs = document.createElement("nav");
      record.propertyTabs.className = "wb-property-tabs";
      record.propertyTabs.setAttribute("role", "tablist");
      record.propertyPageHost = document.createElement("div");
      record.propertyPageHost.className = "wb-property-page-host";
      const actions = document.createElement("footer");
      actions.className = "wb-property-actions";
      for (const [label, command] of [["OK", 1], ["Cancel", 2]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
          this.dispatchControl(record.id, command, NOTIFY.BN_CLICKED, record.id);
        });
        actions.append(button);
      }
      record.client.replaceChildren(
        record.propertyTabs,
        record.propertyPageHost,
        actions,
      );
      this.setWindowText(id, caption);
      return id;
    }

    addPropertyPage(sheetId, pageId, resourceId) {
      const sheet = this.window(sheetId);
      const page = this.window(pageId);
      const index = sheet.propertyPages.length;
      const resource = this.resourcesByDialog.get(unsigned(resourceId));
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.textContent = resource?.caption || `Page ${index + 1}`;
      tab.addEventListener("click", () => {
        this.dispatchControl(
          sheet.id,
          0xe900 + index,
          NOTIFY.BN_CLICKED,
          sheet.id,
        );
      });
      sheet.propertyTabs.append(tab);
      sheet.propertyPages.push({
        page: page.id,
        resourceId: unsigned(resourceId),
        tab,
      });
      page.element.classList.add("wb-property-page");
      page.element.hidden = true;
      sheet.propertyPageHost.append(page.element);
      const width = Math.max(rectWidth(sheet.rect), rectWidth(page.rect) + 28);
      const height = Math.max(rectHeight(sheet.rect), rectHeight(page.rect) + 106);
      sheet.rect.right = sheet.rect.left + width;
      sheet.rect.bottom = sheet.rect.top + height;
      this.applyWindowRect(sheet);
    }

    selectPropertyPage(sheetId, requestedIndex) {
      const sheet = this.window(sheetId);
      const index = Number(requestedIndex) | 0;
      sheet.propertyPages.forEach(({ page, tab }, pageIndex) => {
        const active = pageIndex === index;
        this.window(page).element.hidden = !active;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
    }

    documentString(resourceId, index) {
      const resource = this.resourcesByString.get(unsigned(resourceId));
      if (typeof resource !== "string") return "";
      return resource.split("\n")[Number(index) | 0] ?? "";
    }

    loadImage(resourceId, imageType, desiredWidth, desiredHeight, flags) {
      const kind = unsigned(imageType) === 1 ? "icon"
        : unsigned(imageType) === 2 ? "cursor"
          : "bitmap";
      const key = `${unsigned(resourceId)}:${kind}`;
      const resource = this.resourcesByFile.get(key)
        ?? [...this.resourcesByFile.values()]
          .find(({ value }) => unsigned(value) === unsigned(resourceId));
      if (!resource) return 0;
      const extension = resource.path.split(".").at(-1)?.toLowerCase();
      const mimeType = extension === "bmp" ? "image/bmp"
        : extension === "ico" || extension === "cur" ? "image/x-icon"
          : "application/octet-stream";
      const bytes = this.module.FS.readFile(
        `/world-builder/assets/${resource.path}`,
      );
      const id = this.nextImage++;
      this.images.set(id, {
        id,
        resource,
        imageType: unsigned(imageType),
        desiredWidth: Number(desiredWidth) | 0,
        desiredHeight: Number(desiredHeight) | 0,
        flags: unsigned(flags),
        url: URL.createObjectURL(new Blob([bytes], { type: mimeType })),
      });
      return id;
    }

    destroyImage(imageId) {
      const id = unsigned(imageId);
      const image = this.images.get(id);
      if (!image) return false;
      URL.revokeObjectURL(image.url);
      return this.images.delete(id);
    }

    drawIcon(windowId, x, y, iconId, width, height) {
      const image = this.images.get(unsigned(iconId));
      const context = this.paintContext(windowId);
      if (!image || !context) return;
      const element = new Image();
      element.addEventListener("load", () => {
        context.drawImage(
          element,
          Number(x) | 0,
          Number(y) | 0,
          Math.max(1, Number(width) | 0),
          Math.max(1, Number(height) | 0),
        );
      }, { once: true });
      element.src = image.url;
    }

    setCursor(cursorId, cursorFile) {
      const systemCursors = new Map([
        [32512, "default"],
        [32514, "wait"],
        [32515, "crosshair"],
        [32646, "move"],
      ]);
      const id = unsigned(cursorId);
      let value = systemCursors.get(id);
      const image = this.images.get(id);
      if (image) value = `url("${image.url}") 0 0, default`;
      if (!value && cursorFile) {
        try {
          const normalized = String(cursorFile).replaceAll("\\", "/");
          const bytes = this.module.FS.readFile(normalized);
          const url = URL.createObjectURL(new Blob([bytes], { type: "image/x-icon" }));
          if (this.cursorFileUrl) URL.revokeObjectURL(this.cursorFileUrl);
          this.cursorFileUrl = url;
          value = `url("${url}") 0 0, default`;
        } catch {
          value = "default";
        }
      }
      this.desktop.style.cursor = value || "default";
    }

    systemColor(index) {
      const colors = {
        0: 0x000000,
        5: 0xffffff,
        8: 0x000000,
        13: 0xd77800,
        14: 0xffffff,
        15: 0xf0f0f0,
        16: 0xa0a0a0,
        17: 0x6d6d6d,
        18: 0x000000,
      };
      return colors[Number(index) | 0] ?? 0xf0f0f0;
    }

    beep(frequency, duration) {
      try {
        const context = this.ensureAudioContext();
        if (!context) return false;
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.frequency.value = clamp(Number(frequency) || 440, 37, 32767);
        gain.gain.value = 0.025;
        oscillator.connect(gain).connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + Math.max(0.02, Number(duration) / 1000));
        return true;
      } catch {
        return false;
      }
    }

    ensureAudioContext() {
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.audioContext ??= new AudioContextClass();
      return this.audioContext;
    }

    playSound(filename) {
      if (!filename) return false;
      const audio = new Audio(filename.replaceAll("\\", "/"));
      void audio.play().catch(() => {});
      return true;
    }

    async playSoundBytes(bytes, filename, flags) {
      const generation = ++this.soundPreviewGeneration;
      this.soundPreviewSource?.stop();
      this.soundPreviewSource = null;
      const context = this.ensureAudioContext();
      if (!context) {
        this.report(`Cannot preview ${filename}: Web Audio is unavailable`);
        return false;
      }
      try {
        if (context.state === "suspended") await context.resume();
        const payload = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
        const decoded = await context.decodeAudioData(payload);
        if (generation !== this.soundPreviewGeneration) return false;
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.connect(context.destination);
        source.addEventListener("ended", () => {
          if (this.soundPreviewSource === source) this.soundPreviewSource = null;
        });
        this.soundPreviewSource = source;
        source.start();
        return true;
      } catch (error) {
        this.report(`Cannot preview ${filename}: ${error?.message ?? error}`);
        return false;
      }
    }

    async runColorDialog({ initialColor }) {
      const input = document.createElement("input");
      input.type = "color";
      const value = unsigned(initialColor);
      input.value = `#${[value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]
        .map((component) => component.toString(16).padStart(2, "0"))
        .join("")}`;
      const dialog = document.createElement("section");
      dialog.className = "wb-message-box wb-color-dialog";
      const title = document.createElement("header");
      title.className = "wb-titlebar";
      title.textContent = "Color";
      const body = document.createElement("div");
      body.className = "wb-color-dialog-body";
      const label = document.createElement("label");
      label.textContent = "Selected color";
      label.append(input);
      body.append(label);
      const actions = document.createElement("footer");
      actions.className = "wb-message-box-actions";
      const accept = document.createElement("button");
      accept.type = "button";
      accept.textContent = "OK";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      actions.append(accept, cancel);
      dialog.append(title, body, actions);
      this.modalLayer.hidden = false;
      this.modalLayer.append(dialog);
      return await new Promise((resolve) => {
        const finish = (accepted) => {
          const color = accepted
            ? Number.parseInt(input.value.slice(1), 16)
            : value;
          const converted = ((color & 0xff) << 16) | (color & 0x00ff00) | ((color >>> 16) & 0xff);
          dialog.remove();
          this.modalLayer.hidden =
            !this.modalLayer.querySelector(".modal:not([hidden]), .wb-message-box");
          resolve({ result: accepted ? 1 : 2, color: converted });
        };
        accept.addEventListener("click", () => finish(true), { once: true });
        cancel.addEventListener("click", () => finish(false), { once: true });
        input.focus();
      });
    }

    async runFileDialog(options) {
      if (options.openFile) return await this.openFileDialog(options);
      return await this.saveFileDialog(options);
    }

    async requestFilePicker(title, buttonLabel, operation) {
      const dialog = document.createElement("section");
      dialog.className = "wb-message-box wb-picker-prompt";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const heading = document.createElement("header");
      heading.className = "wb-titlebar";
      heading.textContent = title;
      const copy = document.createElement("p");
      copy.className = "wb-message-box-copy";
      copy.textContent =
        "The browser requires one more click before it can open the system file picker.";
      const actions = document.createElement("footer");
      actions.className = "wb-message-box-actions";
      const choose = document.createElement("button");
      choose.type = "button";
      choose.textContent = buttonLabel;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      actions.append(choose, cancel);
      dialog.append(heading, copy, actions);
      this.modalLayer.hidden = false;
      this.modalLayer.append(dialog);
      return await new Promise((resolve, reject) => {
        let finished = false;
        const finish = (value, error) => {
          if (finished) return;
          finished = true;
          dialog.remove();
          this.modalLayer.hidden =
            !this.modalLayer.querySelector(".modal:not([hidden]), .wb-message-box");
          if (error) reject(error);
          else resolve(value);
        };
        cancel.addEventListener("click", () => finish(null));
        choose.addEventListener("click", async () => {
          choose.disabled = true;
          try {
            finish(await operation());
          } catch (error) {
            if (error?.name === "AbortError") finish(null);
            else finish(null, error);
          }
        });
        choose.focus();
      });
    }

    async openFileDialog(options) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".map";
      const file = await this.requestFilePicker("Open map", "Choose map…", () => {
        return new Promise((resolve) => {
          input.addEventListener("change", () => resolve(input.files?.[0] ?? null), {
            once: true,
          });
          input.addEventListener("cancel", () => resolve(null), { once: true });
          input.click();
        });
      });
      if (!file) return { result: 2, path: "" };
      const directory = this.module.worldBuilderUserDataPath;
      if (!directory) throw new Error("Original World Builder user map directory is unavailable");
      this.ensureFsDirectory(directory);
      const path = `${directory}/${file.name}`;
      this.module.FS.writeFile(path, new Uint8Array(await file.arrayBuffer()));
      await this.fileWritten(path);
      this.launchPath = path;
      return { result: 1, path };
    }

    async saveFileDialog(options) {
      const suggestedName = options.initialFilename || `Untitled${options.defaultExtension || ".map"}`;
      if (typeof global.showSaveFilePicker === "function") {
        const handle = await this.requestFilePicker("Save map", "Choose destination…", () => {
          return global.showSaveFilePicker({
            suggestedName,
            types: [{
              description: "Command & Conquer Generals map",
              accept: { "application/octet-stream": [".map"] },
            }],
          });
        });
        if (!handle) return { result: 2, path: "" };
        const directory = this.module.worldBuilderUserDataPath;
        if (!directory) throw new Error("Original World Builder user map directory is unavailable");
        this.ensureFsDirectory(directory);
        const path = `${directory}/${handle.name}`;
        this.pendingSaveHandles ??= new Map();
        this.pendingSaveHandles.set(path, handle);
        return { result: 1, path };
      }
      const name = global.prompt("Save map as", suggestedName);
      if (!name) return { result: 2, path: "" };
      const directory = this.module.worldBuilderUserDataPath;
      if (!directory) throw new Error("Original World Builder user map directory is unavailable");
      this.ensureFsDirectory(directory);
      return { result: 1, path: `${directory}/${name}` };
    }

    async fileWritten(path) {
      const normalized = String(path).replaceAll("\\", "/");
      try {
        const handle = this.pendingSaveHandles?.get(normalized);
        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(this.module.FS.readFile(normalized));
          await writable.close();
          this.pendingSaveHandles.delete(normalized);
        }
        const persistent = (this.module.worldBuilderPersistentPaths ?? [])
          .some((root) => normalized === root || normalized.startsWith(`${root}/`));
        if (persistent && this.module.FS.filesystems?.IDBFS) {
          await new Promise((resolve, reject) => {
            this.module.FS.syncfs(false, (error) => error ? reject(error) : resolve());
          });
        }
        return true;
      } catch (error) {
        const status = document.querySelector("[data-world-builder-status]");
        if (status) status.textContent = `Could not persist ${normalized}: ${error.message}`;
        console.error("World Builder file persistence failed", normalized, error);
        return false;
      }
    }

    ensureFsDirectory(path) {
      let current = "";
      for (const component of path.split("/").filter(Boolean)) {
        current += `/${component}`;
        try {
          this.module.FS.mkdir(current);
        } catch (error) {
          if (error?.errno !== 20) throw error;
        }
      }
    }

    readProfileInt(section, entry, defaultValue) {
      const stored = localStorage.getItem(profileKey(section, entry));
      if (stored === null) return Number(defaultValue) | 0;
      const parsed = Number.parseInt(stored, 10);
      return Number.isFinite(parsed) ? parsed : Number(defaultValue) | 0;
    }

    writeProfile(section, entry, value) {
      localStorage.setItem(profileKey(section, entry), String(value));
    }

    systemMetric(metric) {
      const desktop = this.window(1).rect;
      const values = {
        0: rectWidth(desktop),
        1: rectHeight(desktop),
        2: 17,
        3: 17,
        4: 23,
        15: 19,
        32: 8,
        33: 8,
        45: 2,
      };
      if (!(Number(metric) in values)) {
        throw new Error(`Unsupported original World Builder system metric ${metric}`);
      }
      return values[Number(metric)];
    }

    installGlobalInput() {
      document.addEventListener("keydown", (event) => {
        const accelerator = this.findAccelerator(event);
        if (accelerator && this.mainFrame) {
          event.preventDefault();
          this.dispatchCommand(this.mainFrame, accelerator.value);
          return;
        }
        const target = this.focusedWindow || this.mainFrame;
        if (target) this.dispatchKey(target, WM.KEYDOWN, event.keyCode, event.repeat ? 2 : 1, 0);
      });
      document.addEventListener("keyup", (event) => {
        const target = this.focusedWindow || this.mainFrame;
        if (target) this.dispatchKey(target, WM.KEYUP, event.keyCode, 1, 0);
      });
      global.addEventListener("resize", () => {
        const record = this.window(1);
        record.rect.right = Math.max(1, this.desktop.clientWidth);
        record.rect.bottom = Math.max(1, this.desktop.clientHeight);
      });
    }

    findAccelerator(event) {
      const table = this.resources.accelerators[0];
      if (!table) return null;
      return table.entries.find((entry) => {
        const flags = new Set(entry.flags);
        if (flags.has("CONTROL") !== event.ctrlKey) return false;
        if (flags.has("SHIFT") !== event.shiftKey) return false;
        if (flags.has("ALT") !== event.altKey) return false;
        const key = entry.key.startsWith("VK_")
          ? entry.key.slice(3).replace("DELETE", "Delete").replace("BACK", "Backspace")
          : entry.key;
        return String(event.key).toLocaleLowerCase() === key.toLocaleLowerCase() ||
          String(event.code).toLocaleLowerCase() === key.toLocaleLowerCase();
      });
    }

    dispatchCommand(windowId, commandId) {
      if (unsigned(commandId) === 32993) {
        this.reserveGameWindow();
      }
      this.module._BrowserMfcDispatchCommand?.(unsigned(windowId), unsigned(commandId));
      this.module._BrowserMfcPumpMessages?.();
      global.setTimeout(() => {
        if (!this.mainFrame) return;
        const frame = this.window(this.mainFrame);
        const activeCommands = [...frame.element.querySelectorAll(
          ".wb-toolbar [data-command-id].checked",
        )].map((button) => Number(button.dataset.commandId));
        this.refreshCommandIds(
          this.mainFrame,
          [commandId, ...activeCommands],
        );
      }, 0);
    }

    reserveGameWindow() {
      if (global.worldBuilderInterceptGameLaunch === true) return;
      try {
        this.pendingGameWindow = global.open("about:blank", "_blank");
        if (this.pendingGameWindow) {
          this.pendingGameWindow.document.title = "Starting Command & Conquer…";
          this.pendingGameWindow.document.body.textContent =
            "Saving the map and starting Command & Conquer…";
        }
      } catch {
        this.pendingGameWindow = null;
      }
    }

    publishReport(path) {
      const normalized = String(path ?? "").replaceAll("\\", "/");
      if (!normalized || normalized.includes("\0")) return false;
      try {
        const data = this.module.FS.readFile(normalized);
        const report = {
          path: normalized,
          bytes: data.byteLength,
          filename: normalized.split("/").at(-1) || "world-builder-report.txt",
        };
        this.lastReport = report;
        global.worldBuilderLastReport = report;
        global.dispatchEvent(new CustomEvent("worldbuilder:report", {
          detail: report,
        }));
        void this.fileWritten(normalized);
        if (global.worldBuilderInterceptReportDownload === true) return true;
        const url = URL.createObjectURL(new Blob([data], {
          type: "text/plain;charset=utf-8",
        }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = report.filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        return true;
      } catch (error) {
        console.error("World Builder report download failed", normalized, error);
        return false;
      }
    }

    launchGameForMap(mapPath) {
      const normalized = String(mapPath ?? "").replaceAll("\\", "/");
      if (!normalized || normalized.includes("\0")) return false;
      const url = new URL("./play.html", global.location.href);
      url.searchParams.set("worldBuilderMap", normalized);
      url.searchParams.set("shellmap", "0");
      url.searchParams.set("autostart", "1");
      this.lastGameLaunch = {
        mapPath: normalized,
        url: url.href,
      };
      console.debug("[world-builder] launching saved map in game", this.lastGameLaunch);
      global.worldBuilderLastGameLaunch = this.lastGameLaunch;
      global.dispatchEvent(new CustomEvent("worldbuilder:launchgame", {
        detail: this.lastGameLaunch,
      }));
      if (global.worldBuilderInterceptGameLaunch === true) return true;
      try {
        const target = this.pendingGameWindow?.closed === false
          ? this.pendingGameWindow
          : global.open("about:blank", "_blank");
        this.pendingGameWindow = null;
        if (!target) return false;
        target.location.replace(url.href);
        return true;
      } catch {
        this.pendingGameWindow = null;
        return false;
      }
    }

    dispatchControl(parentId, controlId, notification, childId) {
      this.module._BrowserMfcDispatchControl?.(
        unsigned(parentId),
        unsigned(controlId),
        unsigned(notification),
        unsigned(childId),
      );
      this.module._BrowserMfcPumpMessages?.();
    }

    dispatchNotify(
      parentId,
      controlId,
      notification,
      childId,
      itemId,
      itemParameter = 0,
      action = 0,
      text = "",
    ) {
      this.module.ccall(
        "BrowserMfcDispatchNotify",
        "number",
        [
          "number",
          "number",
          "number",
          "number",
          "number",
          "number",
          "number",
          "string",
        ],
        [
          unsigned(parentId),
          unsigned(controlId),
          Number(notification) | 0,
          unsigned(childId),
          unsigned(itemId),
          Number(itemParameter) | 0,
          unsigned(action),
          String(text),
        ],
      );
      this.module._BrowserMfcPumpMessages?.();
    }

    dispatchWindowMessage(windowId, message, number0, number1, object) {
      this.module._BrowserMfcDispatchWindowMessage?.(
        unsigned(windowId),
        unsigned(message),
        unsigned(number0),
        unsigned(number1),
        unsigned(object),
      );
      this.module._BrowserMfcPumpMessages?.();
    }

    pointerPoint(event, windowId) {
      const record = this.window(windowId);
      const surface = record.surface ?? record.element;
      const bounds = surface.getBoundingClientRect();
      const scaleX = surface instanceof HTMLCanvasElement
        ? surface.width / Math.max(1, bounds.width)
        : 1;
      const scaleY = surface instanceof HTMLCanvasElement
        ? surface.height / Math.max(1, bounds.height)
        : 1;
      return {
        x: Math.round((event.clientX - bounds.left) * scaleX),
        y: Math.round((event.clientY - bounds.top) * scaleY),
        screenX: Math.round(event.clientX),
        screenY: Math.round(event.clientY),
      };
    }

    dispatchPointer(
      windowId,
      message,
      flags,
      x,
      y,
      screenX = x,
      screenY = y,
    ) {
      this.module._BrowserMfcDispatchPointer?.(
        unsigned(windowId),
        unsigned(message),
        unsigned(flags),
        Number(x) | 0,
        Number(y) | 0,
        Number(screenX) | 0,
        Number(screenY) | 0,
      );
      this.module._BrowserMfcPumpMessages?.();
    }

    dispatchKey(windowId, message, key, repetitions, flags) {
      this.module._BrowserMfcDispatchKey?.(
        unsigned(windowId),
        unsigned(message),
        unsigned(key),
        unsigned(repetitions),
        unsigned(flags),
      );
      this.module._BrowserMfcPumpMessages?.();
    }

    updateCommand(windowId, commandId) {
      if (!this.module._BrowserMfcUpdateCommandUi) return null;
      const window = unsigned(windowId);
      const command = unsigned(commandId);
      const key = `${window}:${command}`;
      const requestToken = ++this.commandRequestSequence;
      this.commandRequestTokens.set(key, requestToken);
      const progress = global.worldBuilderCommandStateProgress ??= {
        requested: Object.create(null),
        completed: Object.create(null),
      };
      progress.requested[key] = requestToken;
      const mask = unsigned(
        this.module._BrowserMfcUpdateCommandUi(window, command, requestToken),
      );
      if (mask !== 0) {
        this.commandStates.set(key, mask);
      }
      const current = mask || this.commandStates.get(key) || 0;
      if (current === 0) return null;
      return {
        handled: Boolean(current & 1),
        enabled: Boolean(current & 2),
        checked: Boolean(current & 4),
        text: "",
      };
    }

    commandStateUpdated(
      windowId,
      commandId,
      mask,
      hasDocument = false,
      documentModified = false,
      documentAddress = 0,
      requestToken = 0,
    ) {
      const window = unsigned(windowId);
      const command = unsigned(commandId);
      const state = unsigned(mask);
      const token = unsigned(requestToken);
      const key = `${window}:${command}`;
      const frame = this.windows.get(window);
      const root = frame?.element ?? document;
      const latestRequest = this.commandRequestTokens.get(key) ?? 0;
      const diagnostic = {
        sequence: ++this.commandStateSequence,
        window,
        command,
        state,
        hasDocument: Boolean(hasDocument),
        documentModified: Boolean(documentModified),
        documentAddress: unsigned(documentAddress),
        requestToken: token,
        latestRequest,
        ignored: token < latestRequest,
        windowFound: Boolean(frame),
        matchingElements: root.querySelectorAll(
          `[data-command-id="${command}"]`,
        ).length,
      };
      this.commandStateHistory.push(diagnostic);
      if (this.commandStateHistory.length > 256) {
        this.commandStateHistory.shift();
      }
      global.worldBuilderCommandStateHistory = this.commandStateHistory;
      if (token < latestRequest) return;
      this.commandStates.set(key, state);
      this.commandCompletedTokens.set(key, token);
      const progress = global.worldBuilderCommandStateProgress ??= {
        requested: Object.create(null),
        completed: Object.create(null),
      };
      progress.completed[key] = token;
      for (const button of root.querySelectorAll(
        `[data-command-id="${command}"]`,
      )) {
        button.disabled = (state & 2) === 0;
        button.classList.toggle("checked", Boolean(state & 4));
      }
    }

    report(message) {
      const element = document.querySelector("[data-world-builder-status]");
      if (element) element.textContent = message;
    }
  }

  global.createWorldBuilderMfcHost = (module) => new BrowserMfcHost(module);
})(globalThis);
