#include "mfc/browser_mfc.h"

#include "resource.h"
#include "CellWidth.h"

#include <iostream>
#include <string>
#include <unordered_map>

class InMemoryMfcHost final : public browser_mfc::Host {
public:
	browser_mfc::WindowId createDialog(
		UINT resourceId,
		browser_mfc::WindowId parent) override
	{
		const auto id = nextId++;
		dialogResources[id] = resourceId;
		kinds[id] = browser_mfc::ControlKind::Generic;
		rectangles[id] = CRect(0, 0, 320, 200);
		parents[id] = parent;
		return id;
	}

	browser_mfc::WindowId createControl(
		browser_mfc::ControlKind kind,
		browser_mfc::WindowId parent,
		UINT controlId,
		const CRect &rect,
		DWORD style) override
	{
		const auto id = nextId++;
		const std::uint64_t key = (static_cast<std::uint64_t>(parent) << 32) | controlId;
		controlIds[key] = id;
		kinds[id] = kind;
		rectangles[id] = rect;
		styles[id] = style;
		parents[id] = parent;
		return id;
	}

	browser_mfc::WindowId createWindow(
		const std::string &className,
		const std::string &windowName,
		DWORD style,
		const CRect &rect,
		browser_mfc::WindowId parent,
		UINT controlId) override
	{
		const auto window = createControl(
			browser_mfc::ControlKind::Generic,
			parent,
			controlId,
			rect,
			style);
		windowClasses[window] = className;
		text[window] = windowName;
		return window;
	}

	browser_mfc::WindowId createWindowEx(
		DWORD extendedStyle,
		const std::string &className,
		const std::string &windowName,
		DWORD style,
		const CRect &rect,
		browser_mfc::WindowId parent,
		std::uintptr_t menuOrControlId) override
	{
		const auto window = createWindow(
			className,
			windowName,
			style,
			rect,
			parent,
			static_cast<UINT>(menuOrControlId));
		extendedStyles[window] = extendedStyle;
		windowMenus[window] = menuOrControlId;
		return window;
	}

	browser_mfc::WindowId createFrame(
		UINT resourceId,
		DWORD style,
		browser_mfc::WindowId parent) override
	{
		const auto frame = nextId++;
		frameResources[frame] = resourceId;
		kinds[frame] = browser_mfc::ControlKind::Generic;
		styles[frame] = style;
		parents[frame] = parent;
		rectangles[frame] = CRect(0, 0, 800, 600);
		visibility[frame] = true;
		return frame;
	}

	browser_mfc::WindowId createDialogBar(
		UINT resourceId,
		DWORD style,
		browser_mfc::WindowId parent,
		UINT controlId) override
	{
		const auto bar = createDialog(resourceId, parent);
		kinds[bar] = browser_mfc::ControlKind::Generic;
		styles[bar] = style;
		const std::uint64_t key =
			(static_cast<std::uint64_t>(parent) << 32) | controlId;
		controlIds[key] = bar;
		return bar;
	}

	browser_mfc::WindowId findControl(browser_mfc::WindowId parent, UINT controlId) override
	{
		const std::uint64_t key = (static_cast<std::uint64_t>(parent) << 32) | controlId;
		const auto existing = controlIds.find(key);
		if (existing != controlIds.end()) return existing->second;
		const auto id = nextId++;
		controlIds[key] = id;
		kinds[id] = browser_mfc::ControlKind::Generic;
		rectangles[id] = CRect(0, 0, 120, 24);
		styles[id] = 0;
		parents[id] = parent;
		return id;
	}

	browser_mfc::ControlKind controlKind(browser_mfc::WindowId window) const override
	{
		const auto found = kinds.find(window);
		return found == kinds.end() ? browser_mfc::ControlKind::Generic : found->second;
	}

	std::string getWindowText(browser_mfc::WindowId window) const override
	{
		const auto found = text.find(window);
		return found == text.end() ? std::string() : found->second;
	}

	void setWindowText(browser_mfc::WindowId window, const std::string &value) override
	{
		text[window] = value;
		setTextSelection(window, textSelection(window));
	}

	int addItem(browser_mfc::WindowId window, const std::string &value) override
	{
		auto &values = items[window];
		values.push_back(value);
		itemParameters[window].push_back(0);
		return static_cast<int>(values.size() - 1);
	}

	int insertItem(browser_mfc::WindowId window, int index, const std::string &value) override
	{
		auto &values = items[window];
		const int clamped = std::max(0, std::min(index, static_cast<int>(values.size())));
		values.insert(values.begin() + clamped, value);
		if (controlKind(window) == browser_mfc::ControlKind::ListControl) {
			auto &rows = listRows[window];
			rows.insert(
				rows.begin() + std::min(
					static_cast<std::size_t>(clamped), rows.size()),
				std::vector<std::string>{value});
		}
		auto &parameters = itemParameters[window];
		parameters.resize(values.size() - 1, 0);
		parameters.insert(parameters.begin() + clamped, 0);
		return clamped;
	}

	int deleteItem(browser_mfc::WindowId window, int index) override
	{
		auto found = items.find(window);
		if (found == items.end() || index < 0 || index >= static_cast<int>(found->second.size())) {
			return LB_ERR;
		}
		found->second.erase(found->second.begin() + index);
		if (controlKind(window) == browser_mfc::ControlKind::ListControl) {
			auto &rows = listRows[window];
			if (index < static_cast<int>(rows.size())) {
				rows.erase(rows.begin() + index);
			}
		}
		auto &parameters = itemParameters[window];
		if (index < static_cast<int>(parameters.size())) {
			parameters.erase(parameters.begin() + index);
		}
		int &selection = selections[window];
		if (selection == index) selection = -1;
		else if (selection > index) --selection;
		auto &selected = multiSelections[window];
		std::unordered_set<int> shifted;
		for (const int selectedIndex : selected) {
			if (selectedIndex < index) shifted.insert(selectedIndex);
			else if (selectedIndex > index) shifted.insert(selectedIndex - 1);
		}
		selected = std::move(shifted);
		return static_cast<int>(found->second.size());
	}

	void resetItems(browser_mfc::WindowId window) override
	{
		items[window].clear();
		itemParameters[window].clear();
		selections[window] = -1;
		multiSelections[window].clear();
		listRows[window].clear();
	}

	int itemCount(browser_mfc::WindowId window) const override
	{
		const auto found = items.find(window);
		return found == items.end() ? 0 : static_cast<int>(found->second.size());
	}

	int selectedItem(browser_mfc::WindowId window) const override
	{
		const auto found = selections.find(window);
		return found == selections.end() ? -1 : found->second;
	}

	int setSelectedItem(browser_mfc::WindowId window, int index) override
	{
		selections[window] = index;
		return index;
	}

	std::string itemText(browser_mfc::WindowId window, int index) const override
	{
		const auto found = items.find(window);
		if (found == items.end() || index < 0 || index >= static_cast<int>(found->second.size())) {
			return {};
		}
		return found->second[static_cast<std::size_t>(index)];
	}

	DWORD_PTR itemData(browser_mfc::WindowId window, int index) const override
	{
		const auto found = itemParameters.find(window);
		if (found == itemParameters.end() || index < 0 ||
			index >= static_cast<int>(found->second.size())) {
			return static_cast<DWORD_PTR>(LB_ERR);
		}
		return found->second[static_cast<std::size_t>(index)];
	}

	int setItemData(browser_mfc::WindowId window, int index, DWORD_PTR value) override
	{
		if (index < 0 || index >= itemCount(window)) return LB_ERR;
		auto &parameters = itemParameters[window];
		parameters.resize(static_cast<std::size_t>(itemCount(window)), 0);
		parameters[static_cast<std::size_t>(index)] = value;
		return 0;
	}

	int itemSelected(browser_mfc::WindowId window, int index) const override
	{
		if (index < 0 || index >= itemCount(window)) return LB_ERR;
		const auto multiple = multiSelections.find(window);
		if (multiple != multiSelections.end() && multiple->second.count(index) != 0) return 1;
		return selectedItem(window) == index ? 1 : 0;
	}

	int setItemSelected(browser_mfc::WindowId window, int index, bool selected) override
	{
		auto &multiple = multiSelections[window];
		if (index == -1) {
			multiple.clear();
			if (selected) {
				for (int item = 0; item < itemCount(window); ++item) multiple.insert(item);
			}
			return 0;
		}
		if (index < 0 || index >= itemCount(window)) return LB_ERR;
		if (selected) multiple.insert(index);
		else multiple.erase(index);
		return 0;
	}

	int findItem(
		browser_mfc::WindowId window,
		int startAfter,
		const std::string &value,
		bool exact) const override
	{
		const auto found = items.find(window);
		if (found == items.end()) return -1;
		const int count = static_cast<int>(found->second.size());
		if (count == 0) return -1;
		const int normalizedStart =
			startAfter < -1 || startAfter >= count ? -1 : startAfter;
		for (int offset = 1; offset <= count; ++offset) {
			const int index = (normalizedStart + offset) % count;
			const std::string &candidate = found->second[static_cast<std::size_t>(index)];
			if ((exact && candidate == value) ||
				(!exact && candidate.compare(0, value.size(), value) == 0)) {
				return index;
			}
		}
		return -1;
	}

	void setHorizontalExtent(browser_mfc::WindowId window, int pixels) override
	{
		horizontalExtents[window] = (std::max)(0, pixels);
	}

	int insertListColumn(
		browser_mfc::WindowId window,
		int index,
		const std::string &heading,
		int format,
		int width,
		int subItem) override
	{
		auto &columns = listColumns[window];
		const int clamped = std::clamp(index, 0, static_cast<int>(columns.size()));
		columns.insert(
			columns.begin() + clamped,
			ListColumn{heading, format, width, subItem});
		return clamped;
	}

	bool setListItemText(
		browser_mfc::WindowId window,
		int item,
		int subItem,
		const std::string &value) override
	{
		auto found = listRows.find(window);
		if (found == listRows.end() ||
			item < 0 ||
			item >= static_cast<int>(found->second.size()) ||
			subItem < 0) {
			return false;
		}
		auto &row = found->second[static_cast<std::size_t>(item)];
		row.resize((std::max)(row.size(), static_cast<std::size_t>(subItem + 1)));
		row[static_cast<std::size_t>(subItem)] = value;
		if (subItem == 0) items[window][static_cast<std::size_t>(item)] = value;
		return true;
	}

	bool ensureListItemVisible(
		browser_mfc::WindowId window,
		int item,
		bool partialOk) override
	{
		if (item < 0 || item >= itemCount(window)) return false;
		visibleListItems[window] = {item, partialOk};
		return true;
	}

	int checkState(browser_mfc::WindowId window) const override
	{
		const auto found = checks.find(window);
		return found == checks.end() ? 0 : found->second;
	}

	UINT buttonState(browser_mfc::WindowId window) const override
	{
		UINT state = static_cast<UINT>(checkState(window));
		if (focused == window) state |= BST_FOCUS;
		return state;
	}

	void setCheckState(browser_mfc::WindowId window, int state) override
	{
		checks[window] = state;
	}

	void setControlRange(browser_mfc::WindowId window, int minimum, int maximum) override
	{
		controlRanges[window] = {minimum, maximum};
		setControlPosition(window, controlPosition(window));
	}

	int controlPosition(browser_mfc::WindowId window) const override
	{
		const auto found = controlPositions.find(window);
		return found == controlPositions.end() ? 0 : found->second;
	}

	int setControlPosition(browser_mfc::WindowId window, int position) override
	{
		const int previous = controlPosition(window);
		const auto found = controlRanges.find(window);
		const std::pair<int, int> range =
			found == controlRanges.end() ? std::pair<int, int>{0, 100} : found->second;
		controlPositions[window] = std::clamp(
			position,
			(std::min)(range.first, range.second),
			(std::max)(range.first, range.second));
		return previous;
	}

	void setControlTickFrequency(browser_mfc::WindowId window, int frequency) override
	{
		controlTickFrequencies[window] = frequency;
	}

	CHARRANGE textSelection(browser_mfc::WindowId window) const override
	{
		const auto found = textSelections.find(window);
		return found == textSelections.end() ? CHARRANGE{} : found->second;
	}

	void setTextSelection(
		browser_mfc::WindowId window,
		const CHARRANGE &selection) override
	{
		const auto textFound = text.find(window);
		const LONG length = textFound == text.end()
			? 0
			: static_cast<LONG>(textFound->second.size());
		auto clampPosition = [length](LONG position) {
			return position < 0 ? length : std::clamp(position, LONG{0}, length);
		};
		LONG start = clampPosition(selection.cpMin);
		LONG end = clampPosition(selection.cpMax);
		if (start > end) std::swap(start, end);
		textSelections[window] = {start, end};
	}

	DWORD richEditEventMask(browser_mfc::WindowId window) const override
	{
		const auto found = richEventMasks.find(window);
		return found == richEventMasks.end() ? 0 : found->second;
	}

	void setRichEditEventMask(browser_mfc::WindowId window, DWORD mask) override
	{
		richEventMasks[window] = mask;
	}

	bool setRichEditDefaultFormat(
		browser_mfc::WindowId window,
		const browser_mfc::RichTextFormat &format) override
	{
		richDefaultFormats[window] = format;
		return true;
	}

	bool setRichEditSelectionFormat(
		browser_mfc::WindowId window,
		const browser_mfc::RichTextFormat &format) override
	{
		richFormatRuns[window].push_back({textSelection(window), format});
		return true;
	}

	void beginPaint(browser_mfc::WindowId window) override
	{
		activePaints.insert(window);
	}

	void endPaint(browser_mfc::WindowId window) override
	{
		activePaints.erase(window);
		invalidRectangles.erase(window);
	}

	void fillRectangle(
		browser_mfc::WindowId window,
		const CRect &rect,
		COLORREF color) override
	{
		drawCommands.push_back({window, rect, CPoint(), CPoint(), color, 0, 0, true});
	}

	void drawLine(
		browser_mfc::WindowId window,
		const CPoint &from,
		const CPoint &to,
		int penStyle,
		int penWidth,
		COLORREF color) override
	{
		drawCommands.push_back(
			{window, CRect(), from, to, color, penStyle, penWidth, false});
	}

	void drawEllipse(
		browser_mfc::WindowId window,
		const CRect &bounds,
		int penStyle,
		int penWidth,
		COLORREF penColor,
		bool fill,
		COLORREF fillColor) override
	{
		ShapeCommand command;
		command.kind = ShapeCommand::Kind::Ellipse;
		command.window = window;
		command.bounds = bounds;
		command.penStyle = penStyle;
		command.penWidth = penWidth;
		command.penColor = penColor;
		command.fill = fill;
		command.fillColor = fillColor;
		shapeCommands.push_back(std::move(command));
	}

	void drawPolygon(
		browser_mfc::WindowId window,
		const std::vector<CPoint> &points,
		int penStyle,
		int penWidth,
		COLORREF penColor,
		bool fill,
		COLORREF fillColor) override
	{
		ShapeCommand command;
		command.kind = ShapeCommand::Kind::Polygon;
		command.window = window;
		command.points = points;
		command.penStyle = penStyle;
		command.penWidth = penWidth;
		command.penColor = penColor;
		command.fill = fill;
		command.fillColor = fillColor;
		shapeCommands.push_back(std::move(command));
	}

	int drawText(
		browser_mfc::WindowId window,
		const std::string &value,
		const CRect &bounds,
		UINT format,
		DWORD textColor,
		bool textColorIsArgb,
		bool transparentBackground,
		COLORREF backgroundColor,
		const LOGFONT *font) override
	{
		TextCommand command;
		command.window = window;
		command.value = value;
		command.bounds = bounds;
		command.format = format;
		command.textColor = textColor;
		command.textColorIsArgb = textColorIsArgb;
		command.transparentBackground = transparentBackground;
		command.backgroundColor = backgroundColor;
		if (font != nullptr) command.font = *font;
		textCommands.push_back(std::move(command));
		return static_cast<int>(value.size());
	}

	int stretchDibits(
		browser_mfc::WindowId window,
		const CRect &destination,
		const CRect &source,
		const void *pixels,
		std::size_t pixelBytes,
		const BITMAPINFO &bitmapInfo,
		UINT colorUse,
		DWORD rasterOperation) override
	{
		if (pixels == nullptr ||
			bitmapInfo.bmiHeader.biBitCount == 0 ||
			rasterOperation != SRCCOPY) {
			return 0;
		}
		BitmapCommand command;
		command.window = window;
		command.destination = destination;
		command.source = source;
		command.info = bitmapInfo.bmiHeader;
		command.colorUse = colorUse;
		command.rasterOperation = rasterOperation;
		const auto *bytes = static_cast<const std::uint8_t *>(pixels);
		command.pixels.assign(bytes, bytes + pixelBytes);
		bitmapCommands.push_back(std::move(command));
		return source.Height();
	}

	CRect windowRect(browser_mfc::WindowId window) const override
	{
		const auto found = rectangles.find(window);
		if (found == rectangles.end()) return CRect();
		CRect result = found->second;
		const auto parent = parents.find(window);
		if (parent != parents.end() && parent->second != 0) {
			const CRect parentRect = windowRect(parent->second);
			result.OffsetRect(parentRect.left, parentRect.top);
		}
		return result;
	}

	CRect clientRect(browser_mfc::WindowId window) const override
	{
		const CRect rect = windowRect(window);
		return CRect(0, 0, rect.Width(), rect.Height());
	}

	DWORD windowStyle(browser_mfc::WindowId window) const override
	{
		const auto found = styles.find(window);
		return found == styles.end() ? 0 : found->second;
	}

	bool setWindowPosition(
		browser_mfc::WindowId window,
		browser_mfc::WindowId insertAfter,
		int x,
		int y,
		int width,
		int height,
		UINT flags) override
	{
		auto found = rectangles.find(window);
		if (found == rectangles.end()) return false;
		CRect &rect = found->second;
		if ((flags & SWP_NOMOVE) == 0) {
			const int currentWidth = rect.Width();
			const int currentHeight = rect.Height();
			rect.left = x;
			rect.top = y;
			rect.right = x + currentWidth;
			rect.bottom = y + currentHeight;
		}
		if ((flags & SWP_NOSIZE) == 0) {
			rect.right = rect.left + width;
			rect.bottom = rect.top + height;
		}
		windowZAfter[window] = insertAfter;
		return true;
	}

	bool redrawWindow(
		browser_mfc::WindowId window,
		const CRect *updateRect,
		UINT flags) override
	{
		if (kinds.find(window) == kinds.end()) return false;
		if ((flags & RDW_INVALIDATE) != 0) {
			invalidRectangles[window] =
				updateRect ? *updateRect : clientRect(window);
		}
		const bool needsPaint =
			invalidRectangles.find(window) != invalidRectangles.end();
		return needsPaint;
	}

	bool updateRect(
		browser_mfc::WindowId window,
		CRect &updateRect) const override
	{
		const auto found = invalidRectangles.find(window);
		if (found == invalidRectangles.end()) return false;
		updateRect = found->second;
		return true;
	}

	void setScrollRange(
		browser_mfc::WindowId window,
		int scrollBar,
		int minimum,
		int maximum,
		bool) override
	{
		scrollRanges[scrollKey(window, scrollBar)] = {minimum, maximum};
		auto &position = scrollPositions[scrollKey(window, scrollBar)];
		position = std::clamp(position, minimum, maximum);
	}

	int setScrollPosition(
		browser_mfc::WindowId window,
		int scrollBar,
		int position,
		bool) override
	{
		const auto key = scrollKey(window, scrollBar);
		const int previous = scrollPositions[key];
		const auto range = scrollRanges.find(key);
		scrollPositions[key] = range == scrollRanges.end()
			? position
			: std::clamp(position, range->second.first, range->second.second);
		return previous;
	}

	void scrollWindow(
		browser_mfc::WindowId window,
		int deltaX,
		int deltaY) override
	{
		scrollDeltas[window] = CPoint(deltaX, deltaY);
		invalidRectangles[window] = clientRect(window);
	}

	void printWindow(
		browser_mfc::WindowId window,
		bool preview) override
	{
		printRequests.push_back({window, preview});
	}

	void screenToClient(browser_mfc::WindowId window, POINT &point) const override
	{
		const CRect rect = windowRect(window);
		point.x -= rect.left;
		point.y -= rect.top;
	}

	void clientToScreen(browser_mfc::WindowId window, POINT &point) const override
	{
		const CRect rect = windowRect(window);
		point.x += rect.left;
		point.y += rect.top;
	}

	bool showWindow(browser_mfc::WindowId window, int command) override
	{
		const bool previous = isWindowVisible(window);
		visibility[window] = command != SW_HIDE;
		showCommands[window] = command;
		switch (command) {
			case SW_SHOWMINIMIZED:
			case SW_MINIMIZE:
			case SW_SHOWMINNOACTIVE:
			case SW_FORCEMINIMIZE:
				minimized[window] = true;
				break;
			case SW_SHOWNORMAL:
			case SW_SHOWMAXIMIZED:
			case SW_SHOWNOACTIVATE:
			case SW_SHOW:
			case SW_SHOWNA:
			case SW_RESTORE:
				minimized[window] = false;
				break;
			default:
				break;
		}
		return previous;
	}

	bool isWindowVisible(browser_mfc::WindowId window) const override
	{
		const auto found = visibility.find(window);
		return found != visibility.end() && found->second;
	}

	bool isWindowMinimized(browser_mfc::WindowId window) const override
	{
		const auto found = minimized.find(window);
		return found != minimized.end() && found->second;
	}

	void setEnabled(browser_mfc::WindowId window, bool enabled) override
	{
		enabledState[window] = enabled;
	}

	bool isEnabled(browser_mfc::WindowId window) const override
	{
		const auto found = enabledState.find(window);
		return found == enabledState.end() || found->second;
	}

	browser_mfc::WindowId setCapture(
		browser_mfc::WindowId window) override
	{
		const browser_mfc::WindowId previous = captured;
		captured = window;
		return previous;
	}

	bool releaseCapture() override
	{
		captured = 0;
		return true;
	}

	browser_mfc::WindowId capturedWindow() const override
	{
		return captured;
	}

	HTREEITEM insertTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM parent,
		HTREEITEM insertAfter,
		const std::string &value,
		LPARAM parameter,
		UINT state,
		int image,
		int selectedImage) override
	{
		TreeState &treeState = trees[tree];
		const auto key = treeState.nextItem++;
		TreeNode node;
		node.parent = normalizeTreeParent(parent);
		node.text = value;
		node.parameter = parameter;
		node.state = state;
		node.image = image;
		node.selectedImage = selectedImage;
		treeState.nodes.emplace(key, std::move(node));
		auto &siblings = treeChildren(treeState, normalizeTreeParent(parent));
		if (insertAfter == TVI_FIRST) {
			siblings.insert(siblings.begin(), key);
		} else if (insertAfter == TVI_SORT) {
			const auto position = std::lower_bound(
				siblings.begin(),
				siblings.end(),
				value,
				[&treeState](std::uintptr_t sibling, const std::string &label) {
					return treeState.nodes.at(sibling).text < label;
				});
			siblings.insert(position, key);
		} else if (insertAfter == TVI_LAST || insertAfter == nullptr) {
			siblings.push_back(key);
		} else {
			const auto afterKey = treeItemKey(insertAfter);
			const auto found = std::find(siblings.begin(), siblings.end(), afterKey);
			siblings.insert(found == siblings.end() ? siblings.end() : found + 1, key);
		}
		return treeItemHandle(key);
	}

	bool readTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item,
		std::string &value,
		LPARAM &parameter,
		UINT &state,
		int &image,
		int &selectedImage,
		int &childCount) const override
	{
		const TreeNode *node = findTreeNode(tree, item);
		if (node == nullptr) return false;
		value = node->text;
		parameter = node->parameter;
		state = node->state;
		image = node->image;
		selectedImage = node->selectedImage;
		childCount = static_cast<int>(node->children.size());
		return true;
	}

	bool writeTreeItem(
		browser_mfc::WindowId tree,
		HTREEITEM item,
		UINT mask,
		const std::string &value,
		LPARAM parameter,
		UINT state,
		UINT stateMask,
		int image,
		int selectedImage) override
	{
		TreeNode *node = findTreeNode(tree, item);
		if (node == nullptr) return false;
		if ((mask & TVIF_TEXT) != 0) node->text = value;
		if ((mask & TVIF_PARAM) != 0) node->parameter = parameter;
		if ((mask & TVIF_STATE) != 0) {
			const UINT effectiveMask = stateMask == 0 ? ~UINT{0} : stateMask;
			node->state = (node->state & ~effectiveMask) | (state & effectiveMask);
		}
		if ((mask & TVIF_IMAGE) != 0) node->image = image;
		if ((mask & TVIF_SELECTEDIMAGE) != 0) node->selectedImage = selectedImage;
		return true;
	}

	HTREEITEM firstTreeChild(browser_mfc::WindowId tree, HTREEITEM parent) const override
	{
		const auto found = trees.find(tree);
		if (found == trees.end()) return nullptr;
		const auto &children = treeChildren(found->second, normalizeTreeParent(parent));
		return children.empty() ? nullptr : treeItemHandle(children.front());
	}

	HTREEITEM nextTreeSibling(browser_mfc::WindowId tree, HTREEITEM item) const override
	{
		const auto found = trees.find(tree);
		if (found == trees.end()) return nullptr;
		const TreeNode *node = findTreeNode(tree, item);
		if (node == nullptr) return nullptr;
		const auto &siblings = treeChildren(found->second, node->parent);
		const auto position = std::find(siblings.begin(), siblings.end(), treeItemKey(item));
		return position == siblings.end() || position + 1 == siblings.end()
			? nullptr
			: treeItemHandle(*(position + 1));
	}

	HTREEITEM parentTreeItem(browser_mfc::WindowId tree, HTREEITEM item) const override
	{
		const TreeNode *node = findTreeNode(tree, item);
		return node == nullptr || node->parent == 0 ? nullptr : treeItemHandle(node->parent);
	}

	bool deleteTreeItem(browser_mfc::WindowId tree, HTREEITEM item) override
	{
		auto treeFound = trees.find(tree);
		if (treeFound == trees.end()) return false;
		TreeState &treeState = treeFound->second;
		const auto key = treeItemKey(item);
		auto nodeFound = treeState.nodes.find(key);
		if (nodeFound == treeState.nodes.end()) return false;
		auto &siblings = treeChildren(treeState, nodeFound->second.parent);
		siblings.erase(std::remove(siblings.begin(), siblings.end(), key), siblings.end());
		deleteTreeSubtree(treeState, key);
		if (treeState.selected == key) treeState.selected = 0;
		return true;
	}

	void deleteAllTreeItems(browser_mfc::WindowId tree) override
	{
		trees[tree] = TreeState();
	}

	HTREEITEM selectedTreeItem(browser_mfc::WindowId tree) const override
	{
		const auto found = trees.find(tree);
		return found == trees.end() || found->second.selected == 0
			? nullptr
			: treeItemHandle(found->second.selected);
	}

	bool selectTreeItem(browser_mfc::WindowId tree, HTREEITEM item) override
	{
		TreeState &treeState = trees[tree];
		const auto key = treeItemKey(item);
		if (key != 0 && treeState.nodes.find(key) == treeState.nodes.end()) return false;
		if (treeState.selected != 0) {
			treeState.nodes[treeState.selected].state &= ~TVIS_SELECTED;
		}
		treeState.selected = key;
		if (key != 0) treeState.nodes[key].state |= TVIS_SELECTED;
		return true;
	}

	bool selectTreeDropTarget(browser_mfc::WindowId tree, HTREEITEM item) override
	{
		TreeState &treeState = trees[tree];
		const auto key = treeItemKey(item);
		if (key != 0 && treeState.nodes.find(key) == treeState.nodes.end()) return false;
		if (treeState.dropTarget != 0) {
			treeState.nodes[treeState.dropTarget].state &= ~TVIS_DROPHILITED;
		}
		treeState.dropTarget = key;
		if (key != 0) treeState.nodes[key].state |= TVIS_DROPHILITED;
		return true;
	}

	bool setTreeFirstVisibleItem(browser_mfc::WindowId tree, HTREEITEM item) override
	{
		TreeState &treeState = trees[tree];
		const auto key = treeItemKey(item);
		if (key != 0 && treeState.nodes.find(key) == treeState.nodes.end()) return false;
		treeState.firstVisible = key;
		return true;
	}

	HTREEITEM hitTestTreeItem(
		browser_mfc::WindowId tree,
		const CPoint &point,
		UINT &flags) const override
	{
		flags = TVHT_NOWHERE;
		const auto treeFound = trees.find(tree);
		if (treeFound == trees.end()) return nullptr;
		const CRect bounds = clientRect(tree);
		if (point.y < bounds.top) {
			flags = TVHT_ABOVE;
			return nullptr;
		}
		if (point.y >= bounds.bottom) {
			flags = TVHT_BELOW;
			return nullptr;
		}
		if (point.x < bounds.left) {
			flags = TVHT_TOLEFT;
			return nullptr;
		}
		if (point.x >= bounds.right) {
			flags = TVHT_TORIGHT;
			return nullptr;
		}

		std::vector<std::uintptr_t> visibleItems;
		appendVisibleTreeItems(treeFound->second, 0, visibleItems);
		std::size_t firstVisible = 0;
		if (treeFound->second.firstVisible != 0) {
			const auto found = std::find(
				visibleItems.begin(),
				visibleItems.end(),
				treeFound->second.firstVisible);
			if (found != visibleItems.end()) {
				firstVisible = static_cast<std::size_t>(found - visibleItems.begin());
			}
		}
		constexpr int itemHeight = 20;
		const std::size_t row =
			firstVisible + static_cast<std::size_t>(point.y / itemHeight);
		if (row >= visibleItems.size()) return nullptr;
		flags = TVHT_ONITEMLABEL;
		return treeItemHandle(visibleItems[row]);
	}

	browser_mfc::WindowId beginTreeLabelEdit(
		browser_mfc::WindowId tree,
		HTREEITEM item) override
	{
		TreeNode *node = findTreeNode(tree, item);
		if (node == nullptr) return 0;
		const auto editor = createControl(
			browser_mfc::ControlKind::Edit,
			tree,
			0,
			CRect(0, 0, clientRect(tree).Width(), 20),
			WS_CHILD);
		text[editor] = node->text;
		textSelections[editor] = {0, static_cast<LONG>(node->text.size())};
		treeLabelEdits[tree] = {treeItemKey(item), editor};
		return editor;
	}

	bool endTreeLabelEdit(
		browser_mfc::WindowId tree,
		bool cancel) override
	{
		const auto found = treeLabelEdits.find(tree);
		if (found == treeLabelEdits.end()) return false;
		if (!cancel) {
			auto treeFound = trees.find(tree);
			if (treeFound == trees.end()) return false;
			auto node = treeFound->second.nodes.find(found->second.item);
			if (node == treeFound->second.nodes.end()) return false;
			node->second.text = getWindowText(found->second.editor);
		}
		destroyWindow(found->second.editor);
		treeLabelEdits.erase(found);
		return true;
	}

	browser_mfc::ImageListId createImageList(
		int width,
		int height,
		UINT flags,
		int initialCount,
		int growCount) override
	{
		if (width <= 0 || height <= 0 || initialCount < 0 || growCount < 0) return 0;
		const auto images = nextImageListId++;
		imageLists.emplace(
			images,
			ImageListState{width, height, flags, initialCount, growCount, {}});
		return images;
	}

	browser_mfc::ImageListId createImageListFromBitmap(
		UINT bitmapResourceId,
		int cellWidth,
		int growCount,
		COLORREF transparentColor) override
	{
		if (bitmapResourceId == 0 || cellWidth <= 0 || growCount < 0) return 0;
		const auto images = createImageList(
			cellWidth, cellWidth, ILC_COLOR4, 0, growCount);
		imageListBitmapResources[images] = bitmapResourceId;
		imageListTransparentColors[images] = transparentColor;
		return images;
	}

	int addImageListIcon(
		browser_mfc::ImageListId images,
		HICON icon) override
	{
		auto found = imageLists.find(images);
		if (found == imageLists.end() || icon == nullptr) return -1;
		found->second.icons.push_back(icon);
		return static_cast<int>(found->second.icons.size() - 1);
	}

	browser_mfc::ImageListId setTreeImageList(
		browser_mfc::WindowId tree,
		browser_mfc::ImageListId images,
		int listType) override
	{
		if (controlKind(tree) != browser_mfc::ControlKind::TreeControl ||
			(images != 0 && imageLists.find(images) == imageLists.end()) ||
			(listType != TVSIL_NORMAL && listType != TVSIL_STATE)) {
			return 0;
		}
		const std::uint64_t key =
			(static_cast<std::uint64_t>(tree) << 32) |
			static_cast<std::uint32_t>(listType);
		const auto found = treeImageLists.find(key);
		const auto previous =
			found == treeImageLists.end() ? 0 : found->second;
		trees.try_emplace(tree);
		treeImageLists[key] = images;
		return previous;
	}

	browser_mfc::WindowId createStatusBar(
		browser_mfc::WindowId parent) override
	{
		const auto id = nextId++;
		kinds[id] = browser_mfc::ControlKind::StatusBar;
		parents[id] = parent;
		rectangles[id] = CRect(0, 0, clientRect(parent).Width(), 22);
		styles[id] = WS_CHILD | WS_VISIBLE;
		return id;
	}

	bool setStatusIndicators(
		browser_mfc::WindowId statusBar,
		const std::vector<UINT> &indicators) override
	{
		if (controlKind(statusBar) != browser_mfc::ControlKind::StatusBar) return false;
		statusIndicators[statusBar] = indicators;
		return true;
	}

	browser_mfc::WindowId createToolBar(
		browser_mfc::WindowId parent,
		DWORD controlStyle,
		DWORD barStyle) override
	{
		const auto id = nextId++;
		kinds[id] = browser_mfc::ControlKind::ToolBar;
		parents[id] = parent;
		rectangles[id] = CRect(0, 0, clientRect(parent).Width(), 28);
		styles[id] = controlStyle | barStyle;
		return id;
	}

	bool loadToolBarResource(
		browser_mfc::WindowId toolbar,
		UINT resourceId) override
	{
		if (controlKind(toolbar) != browser_mfc::ControlKind::ToolBar) return false;
		toolbarResources[toolbar] = resourceId;
		return true;
	}

	void enableDocking(
		browser_mfc::WindowId window,
		DWORD alignment) override
	{
		dockingAlignments[window] = alignment;
	}

	void dockControlBar(
		browser_mfc::WindowId frame,
		browser_mfc::WindowId controlBar) override
	{
		if (kinds.find(frame) == kinds.end() ||
			kinds.find(controlBar) == kinds.end()) {
			throw std::invalid_argument("DockControlBar uses an unknown window");
		}
		dockedBars[controlBar] = frame;
	}

	void floatControlBar(
		browser_mfc::WindowId frame,
		browser_mfc::WindowId controlBar,
		const CPoint &screenPosition,
		DWORD alignment) override
	{
		if (parents.find(controlBar) == parents.end()) {
			throw browser_mfc::UnsupportedOperation(
				"cannot float an unknown control bar");
		}
		floatingBars[controlBar] = {frame, screenPosition, alignment};
		setWindowPosition(
			controlBar,
			0,
			screenPosition.x,
			screenPosition.y,
			0,
			0,
			SWP_NOSIZE | SWP_NOZORDER);
	}

	void saveBarState(
		browser_mfc::WindowId frame,
		const std::string &profileName) override
	{
		savedBarProfiles[profileName] = frame;
	}

	void setFrameMessage(
		browser_mfc::WindowId frame,
		const std::string &message) override
	{
		frameMessages[frame] = message;
	}

	browser_mfc::MenuId loadMenuResource(UINT resourceId) override
	{
		const auto root = createMenu();
		const auto popup = createMenu();
		appendSubmenu(root, popup, resourceId == IDR_SCRIPTDIALOGPOPUP
			? "Layers List"
			: "Layers List");

		if (resourceId == IDR_SCRIPTDIALOGPOPUP) {
			appendCommand(popup, ID_SCRIPTACTIVATE, "Active");
			return root;
		}
		if (resourceId != IDR_LAYERSLISTPOPUP) {
			destroyMenu(root);
			throw browser_mfc::UnsupportedOperation(
				"InMemoryMfcHost has no fixture for menu resource " +
				std::to_string(resourceId));
		}

		appendCommand(popup, ID_SELECTLAYEROBJECT, "Select Object");
		appendCommand(popup, ID_SELECTACTIVELAYER, "Select Active Layer");
		appendSeparator(popup);
		appendCommand(popup, ID_INSERTNEWLAYER, "Insert New Layer");
		appendCommand(popup, ID_DELETECURRENTLAYER, "Delete Current Layer");
		const auto mergeLayer = createMenu();
		appendSubmenu(popup, mergeLayer, "Merge Layer into");
		appendCommand(
			mergeLayer,
			ID_LAYERSLIST_MERGELAYERINTO_BOGUS,
			"Bogus");
		const auto mergeObject = createMenu();
		appendSubmenu(popup, mergeObject, "Merge Object into ");
		appendCommand(
			mergeObject,
			ID_LAYERSLIST_MERGEOBJECTINTO_BOGUS,
			"Bogus");
		const auto mergeSelection = createMenu();
		appendSubmenu(popup, mergeSelection, "Merge View Selection Into");
		appendCommand(
			mergeSelection,
			ID_LAYERSLIST_MERGEVIEWSELECTIONINTO_BOGUS,
			"Bogus");
		appendSeparator(popup);
		appendCommand(popup, ID_HIDECURRENTLAYER, "Hide Current Layer");
		return root;
	}

	browser_mfc::MenuId submenu(
		browser_mfc::MenuId menu,
		int position) const override
	{
		const MenuState *state = findMenu(menu);
		if (state == nullptr ||
			position < 0 ||
			position >= static_cast<int>(state->items.size())) {
			return 0;
		}
		return state->items[static_cast<std::size_t>(position)].submenu;
	}

	bool appendMenuItem(
		browser_mfc::MenuId menu,
		UINT flags,
		std::uintptr_t commandOrSubmenu,
		const std::string &value) override
	{
		MenuState *state = findMenu(menu);
		if (state == nullptr) return false;
		MenuItem item;
		item.text = value;
		item.separator = (flags & MF_SEPARATOR) != 0;
		item.enabled = (flags & (MF_DISABLED | MF_GRAYED)) == 0;
		item.checked = (flags & MF_CHECKED) != 0;
		if ((flags & MF_POPUP) != 0) {
			item.submenu = static_cast<browser_mfc::MenuId>(commandOrSubmenu);
			if (findMenu(item.submenu) == nullptr) return false;
		} else {
			item.command = static_cast<UINT>(commandOrSubmenu);
		}
		state->items.push_back(std::move(item));
		return true;
	}

	bool removeMenuItem(
		browser_mfc::MenuId menu,
		UINT item,
		UINT flags) override
	{
		MenuState *state = findMenu(menu);
		if (state == nullptr) return false;
		auto found = findMenuItem(*state, item, flags);
		if (found == state->items.end()) return false;
		state->items.erase(found);
		return true;
	}

	int enableMenuItem(
		browser_mfc::MenuId menu,
		UINT item,
		UINT flags) override
	{
		MenuState *state = findMenu(menu);
		if (state == nullptr) return -1;
		auto found = findMenuItem(*state, item, flags);
		if (found == state->items.end()) return -1;
		const int previous = found->enabled ? 0 : MF_GRAYED;
		found->enabled = (flags & (MF_DISABLED | MF_GRAYED)) == 0;
		return previous;
	}

	int checkMenuItem(
		browser_mfc::MenuId menu,
		UINT item,
		UINT flags) override
	{
		MenuState *state = findMenu(menu);
		if (state == nullptr) return -1;
		auto found = findMenuItem(*state, item, flags);
		if (found == state->items.end()) return -1;
		const int previous = found->checked ? MF_CHECKED : MF_UNCHECKED;
		found->checked = (flags & MF_CHECKED) != 0;
		return previous;
	}

	UINT trackPopupMenu(
		browser_mfc::MenuId menu,
		UINT,
		int screenX,
		int screenY,
		browser_mfc::WindowId owner) override
	{
		lastPopupMenu = menu;
		lastPopupOwner = owner;
		lastPopupPoint = CPoint(screenX, screenY);
		if (nextPopupCommand == 0) return 0;
		const MenuItem *item = findCommand(menu, nextPopupCommand);
		if (item == nullptr || !item->enabled) return 0;
		const UINT result = nextPopupCommand;
		nextPopupCommand = 0;
		return result;
	}

	bool destroyMenu(browser_mfc::MenuId menu) override
	{
		auto found = menus.find(menu);
		if (found == menus.end()) return false;
		const auto items = found->second.items;
		menus.erase(found);
		for (const MenuItem &item : items) {
			if (item.submenu != 0) destroyMenu(item.submenu);
		}
		return true;
	}

	bool destroyWindow(browser_mfc::WindowId window) override
	{
		const bool existed = kinds.erase(window) != 0;
		rectangles.erase(window);
		styles.erase(window);
		visibility.erase(window);
		minimized.erase(window);
		enabledState.erase(window);
		text.erase(window);
		textSelections.erase(window);
		richEventMasks.erase(window);
		richDefaultFormats.erase(window);
		richFormatRuns.erase(window);
		parents.erase(window);
		return existed;
	}

	UINT setTimer(
		browser_mfc::WindowId window,
		UINT eventId,
		UINT milliseconds) override
	{
		if (kinds.find(window) == kinds.end() || milliseconds == 0) return 0;
		if (eventId == 0) eventId = nextTimerId++;
		timers[timerKey(window, eventId)] = milliseconds;
		return eventId;
	}

	bool killTimer(
		browser_mfc::WindowId window,
		UINT eventId) override
	{
		return timers.erase(timerKey(window, eventId)) != 0;
	}

	LRESULT deliverNativeMessage(
		browser_mfc::WindowId window,
		UINT message,
		WPARAM wParam,
		LPARAM lParam) override
	{
		const auto kind = controlKind(window);
		if (message == BM_SETIMAGE) {
			const HANDLE previous = windowImages[window];
			windowImages[window] = reinterpret_cast<HANDLE>(lParam);
			return static_cast<LRESULT>(
				reinterpret_cast<std::uintptr_t>(previous));
		}
		if (message == WM_CLEAR &&
			(kind == browser_mfc::ControlKind::Edit ||
				kind == browser_mfc::ControlKind::RichEdit ||
				kind == browser_mfc::ControlKind::ComboBox)) {
			std::string &value = text[window];
			const CHARRANGE selection = textSelection(window);
			const auto start = static_cast<std::size_t>(selection.cpMin);
			const auto end = static_cast<std::size_t>(selection.cpMax);
			value.erase(start, end - start);
			setTextSelection(
				window,
				CHARRANGE{selection.cpMin, selection.cpMin});
			return 1;
		}
		if (message != WM_CHAR) return 0;
		if (kind == browser_mfc::ControlKind::Edit ||
			kind == browser_mfc::ControlKind::RichEdit) {
			std::string &value = text[window];
			CHARRANGE selection = textSelection(window);
			const auto start = static_cast<std::size_t>(selection.cpMin);
			const auto end = static_cast<std::size_t>(selection.cpMax);
			if (wParam == VK_BACK) {
				if (start != end) {
					value.erase(start, end - start);
				} else if (start != 0) {
					value.erase(start - 1, 1);
					--selection.cpMin;
				}
			} else {
				value.replace(start, end - start, 1, static_cast<char>(wParam));
				++selection.cpMin;
			}
			selection.cpMax = selection.cpMin;
			setTextSelection(window, selection);
			return 1;
		}
		if (kind == browser_mfc::ControlKind::ComboBox ||
			kind == browser_mfc::ControlKind::ListBox) {
			const char wanted = static_cast<char>(
				std::tolower(static_cast<unsigned char>(wParam)));
			const auto found = items.find(window);
			if (found == items.end()) return 1;
			for (std::size_t index = 0; index < found->second.size(); ++index) {
				if (!found->second[index].empty() &&
					static_cast<char>(std::tolower(
						static_cast<unsigned char>(found->second[index][0]))) == wanted) {
					setSelectedItem(window, static_cast<int>(index));
					break;
				}
			}
			return 1;
		}
		return 0;
	}

	void setFocus(browser_mfc::WindowId window) override
	{
		focused = window;
	}

	int runModal(browser_mfc::WindowId) override
	{
		return modalResult;
	}

	browser_mfc::WindowId createPropertySheet(
		const std::string &caption,
		browser_mfc::WindowId parent) override
	{
		const auto sheet = createDialog(0, parent);
		text[sheet] = caption;
		propertyPages[sheet] = {};
		return sheet;
	}

	void addPropertyPage(
		browser_mfc::WindowId propertySheet,
		browser_mfc::WindowId propertyPage,
		UINT resourceId) override
	{
		if (kinds.find(propertySheet) == kinds.end() ||
			kinds.find(propertyPage) == kinds.end()) {
			throw std::invalid_argument("property sheet page uses an unknown window");
		}
		propertyPages[propertySheet].push_back({propertyPage, resourceId});
	}

	void selectPropertyPage(
		browser_mfc::WindowId propertySheet,
		unsigned int pageIndex) override
	{
		selectedPropertyPage[propertySheet] = pageIndex;
	}

	void closeDialog(browser_mfc::WindowId dialog, int result) override
	{
		closedDialog = dialog;
		closedResult = result;
	}

	std::string loadString(UINT resourceId) const override
	{
		return "resource:" + std::to_string(resourceId);
	}

	std::string documentString(UINT, int stringIndex) const override
	{
		if (stringIndex == CDocTemplate::filterExt) return ".map";
		return {};
	}

	HICON loadIcon(UINT resourceId) override
	{
		const auto icon = reinterpret_cast<HICON>(
			static_cast<std::uintptr_t>(resourceId));
		loadedIcons.insert(icon);
		return icon;
	}

	HANDLE loadImage(
		UINT resourceId,
		UINT imageType,
		int,
		int,
		UINT) override
	{
		if (resourceId == 0 ||
			(imageType != IMAGE_BITMAP && imageType != IMAGE_ICON)) return nullptr;
		const HANDLE image = reinterpret_cast<HANDLE>(nextImageHandle++);
		loadedImages[image] = imageType;
		return image;
	}

	bool destroyImage(HANDLE image, UINT imageType) override
	{
		const auto found = loadedImages.find(image);
		if (found == loadedImages.end() || found->second != imageType) return false;
		loadedImages.erase(found);
		return true;
	}

	void drawIcon(
		browser_mfc::WindowId window,
		int x,
		int y,
		HICON icon,
		int width,
		int height,
		UINT flags) override
	{
		iconCommands.push_back({window, x, y, icon, width, height, flags});
	}

	COLORREF systemColor(int colorIndex) const override
	{
		switch (colorIndex) {
			case COLOR_BTNFACE: return RGB(240, 240, 240);
			case COLOR_3DSHADOW: return RGB(160, 160, 160);
			case COLOR_3DHILIGHT: return RGB(255, 255, 255);
			case COLOR_3DDKSHADOW: return RGB(105, 105, 105);
			case COLOR_3DLIGHT: return RGB(227, 227, 227);
			default: return RGB(0, 0, 0);
		}
	}

	bool beep(DWORD frequency, DWORD durationMilliseconds) override
	{
		beeps.push_back({frequency, durationMilliseconds});
		return frequency >= 37 && frequency <= 32767 && durationMilliseconds != 0;
	}

	bool initializeControls() override
	{
		controlsInitialized = true;
		return true;
	}

	std::string launchDocumentPath() const override
	{
		return launchPath;
	}

	HCURSOR loadCursor(UINT resourceId) override
	{
		const auto cursor = reinterpret_cast<HCURSOR>(
			static_cast<std::uintptr_t>(resourceId));
		loadedCursors.insert(cursor);
		return cursor;
	}

	bool destroyCursor(HCURSOR cursor) override
	{
		return loadedCursors.erase(cursor) != 0;
	}

	bool messageBeep(UINT type) override
	{
		beepTypes.push_back(type);
		return true;
	}

	int runMessageBox(
		const std::string &,
		const std::string &,
		UINT,
		browser_mfc::WindowId) override
	{
		return modalResult;
	}

	int runColorDialog(
		COLORREF initialColor,
		DWORD,
		browser_mfc::WindowId,
		COLORREF &chosenColor) override
	{
		chosenColor = initialColor;
		return modalResult;
	}

	int runFileDialog(
		bool,
		const std::string &,
		const std::string &,
		DWORD,
		const std::string &,
		browser_mfc::WindowId,
		std::string &selectedPath) override
	{
		if (fileDialogPath.empty()) return IDCANCEL;
		selectedPath = fileDialogPath;
		return modalResult;
	}

	bool fileWritten(const std::string &path) override
	{
		writtenFiles.push_back(path);
		return true;
	}

	bool playSound(const std::string &filename, DWORD flags) override
	{
		soundRequests.emplace_back(filename, flags);
		return true;
	}

	int readProfileInt(
		const std::string &section,
		const std::string &entry,
		int defaultValue) const override
	{
		const auto found = profileInts.find(profileKey(section, entry));
		return found == profileInts.end() ? defaultValue : found->second;
	}

	std::string readProfileString(
		const std::string &section,
		const std::string &entry,
		const std::string &defaultValue) const override
	{
		const auto found = profileStrings.find(profileKey(section, entry));
		return found == profileStrings.end() ? defaultValue : found->second;
	}

	bool writeProfileInt(
		const std::string &section,
		const std::string &entry,
		int value) override
	{
		profileInts[profileKey(section, entry)] = value;
		return true;
	}

	bool writeProfileString(
		const std::string &section,
		const std::string &entry,
		const std::string &value) override
	{
		profileStrings[profileKey(section, entry)] = value;
		return true;
	}

	int systemMetric(int metric) const override
	{
		switch (metric) {
			case SM_CYCAPTION:
				return 23;
			case SM_CXEDGE:
				return 2;
			default:
				throw browser_mfc::UnsupportedOperation(
					"InMemoryMfcHost has no fixture for system metric " +
					std::to_string(metric));
		}
	}

	void uninitializeComApartment() override
	{
		++comUninitializeCount;
	}

	UINT resourceFor(browser_mfc::WindowId dialog) const
	{
		const auto found = dialogResources.find(dialog);
		return found == dialogResources.end() ? 0 : found->second;
	}

	std::unordered_map<browser_mfc::WindowId, std::string> text;
	std::unordered_map<browser_mfc::WindowId, std::vector<std::string>> items;
	std::unordered_map<browser_mfc::WindowId, std::vector<DWORD_PTR>> itemParameters;
	std::unordered_map<browser_mfc::WindowId, int> selections;
	std::unordered_map<browser_mfc::WindowId, std::unordered_set<int>> multiSelections;
	std::unordered_map<browser_mfc::WindowId, int> checks;
	std::unordered_map<browser_mfc::WindowId, CHARRANGE> textSelections;
	std::unordered_map<browser_mfc::WindowId, DWORD> richEventMasks;
	std::unordered_map<browser_mfc::WindowId, browser_mfc::RichTextFormat> richDefaultFormats;
	std::vector<UINT> beepTypes;
	std::vector<std::pair<std::string, DWORD>> soundRequests;
	std::vector<std::string> writtenFiles;
	std::unordered_set<HCURSOR> loadedCursors;
	std::unordered_set<HICON> loadedIcons;
	browser_mfc::WindowId focused = 0;
	browser_mfc::WindowId closedDialog = 0;
	int closedResult = 0;
	int modalResult = IDOK;
	bool controlsInitialized = false;
	std::string launchPath;
	std::vector<std::pair<DWORD, DWORD>> beeps;
	int comUninitializeCount = 0;
	UINT nextPopupCommand = 0;
	browser_mfc::MenuId lastPopupMenu = 0;
	browser_mfc::WindowId lastPopupOwner = 0;
	CPoint lastPopupPoint;

private:
	struct DrawCommand {
		browser_mfc::WindowId window = 0;
		CRect rectangle;
		CPoint from;
		CPoint to;
		COLORREF color = 0;
		int penStyle = 0;
		int penWidth = 0;
		bool fill = false;
	};

	struct ShapeCommand {
		enum class Kind {
			Ellipse,
			Polygon,
		};
		Kind kind = Kind::Ellipse;
		browser_mfc::WindowId window = 0;
		CRect bounds;
		std::vector<CPoint> points;
		int penStyle = 0;
		int penWidth = 0;
		COLORREF penColor = 0;
		bool fill = false;
		COLORREF fillColor = 0;
	};

	struct ListColumn {
		std::string heading;
		int format = LVCFMT_LEFT;
		int width = -1;
		int subItem = -1;
	};

	struct TextCommand {
		browser_mfc::WindowId window = 0;
		std::string value;
		CRect bounds;
		UINT format = 0;
		DWORD textColor = 0;
		bool textColorIsArgb = false;
		bool transparentBackground = true;
		COLORREF backgroundColor = 0;
		LOGFONT font;
	};

	struct BitmapCommand {
		browser_mfc::WindowId window = 0;
		CRect destination;
		CRect source;
		BITMAPINFOHEADER info = {};
		UINT colorUse = 0;
		DWORD rasterOperation = 0;
		std::vector<std::uint8_t> pixels;
	};

	struct IconCommand {
		browser_mfc::WindowId window = 0;
		int x = 0;
		int y = 0;
		HICON icon = nullptr;
		int width = 0;
		int height = 0;
		UINT flags = 0;
	};

	struct TreeNode {
		std::uintptr_t parent = 0;
		std::string text;
		LPARAM parameter = 0;
		UINT state = 0;
		int image = 0;
		int selectedImage = 0;
		std::vector<std::uintptr_t> children;
	};

	struct TreeState {
		std::uintptr_t nextItem = 1;
		std::uintptr_t selected = 0;
		std::uintptr_t dropTarget = 0;
		std::uintptr_t firstVisible = 0;
		std::vector<std::uintptr_t> roots;
		std::unordered_map<std::uintptr_t, TreeNode> nodes;
	};

	struct RichFormatRun {
		CHARRANGE range;
		browser_mfc::RichTextFormat format;
	};

	struct TreeLabelEdit {
		std::uintptr_t item = 0;
		browser_mfc::WindowId editor = 0;
	};

	struct ImageListState {
		int width = 0;
		int height = 0;
		UINT flags = 0;
		int initialCount = 0;
		int growCount = 0;
		std::vector<HICON> icons;
	};

	struct FloatingBarState {
		browser_mfc::WindowId frame = 0;
		CPoint position;
		DWORD alignment = 0;
	};

	struct MenuItem {
		UINT command = 0;
		browser_mfc::MenuId submenu = 0;
		std::string text;
		bool separator = false;
		bool enabled = true;
		bool checked = false;
	};

	struct MenuState {
		std::vector<MenuItem> items;
	};

	static std::uintptr_t treeItemKey(HTREEITEM item)
	{
		return reinterpret_cast<std::uintptr_t>(item);
	}

	static HTREEITEM treeItemHandle(std::uintptr_t item)
	{
		return reinterpret_cast<HTREEITEM>(item);
	}

	static std::uintptr_t normalizeTreeParent(HTREEITEM parent)
	{
		return parent == nullptr || parent == TVI_ROOT ? 0 : treeItemKey(parent);
	}

	static std::vector<std::uintptr_t> &treeChildren(
		TreeState &tree,
		std::uintptr_t parent)
	{
		return parent == 0 ? tree.roots : tree.nodes.at(parent).children;
	}

	static const std::vector<std::uintptr_t> &treeChildren(
		const TreeState &tree,
		std::uintptr_t parent)
	{
		return parent == 0 ? tree.roots : tree.nodes.at(parent).children;
	}

	TreeNode *findTreeNode(browser_mfc::WindowId tree, HTREEITEM item)
	{
		auto treeFound = trees.find(tree);
		if (treeFound == trees.end()) return nullptr;
		auto found = treeFound->second.nodes.find(treeItemKey(item));
		return found == treeFound->second.nodes.end() ? nullptr : &found->second;
	}

	const TreeNode *findTreeNode(browser_mfc::WindowId tree, HTREEITEM item) const
	{
		const auto treeFound = trees.find(tree);
		if (treeFound == trees.end()) return nullptr;
		const auto found = treeFound->second.nodes.find(treeItemKey(item));
		return found == treeFound->second.nodes.end() ? nullptr : &found->second;
	}

	static void deleteTreeSubtree(TreeState &tree, std::uintptr_t key)
	{
		const auto found = tree.nodes.find(key);
		if (found == tree.nodes.end()) return;
		const auto children = found->second.children;
		for (const auto child : children) deleteTreeSubtree(tree, child);
		tree.nodes.erase(key);
	}

	static void appendVisibleTreeItems(
		const TreeState &tree,
		std::uintptr_t parent,
		std::vector<std::uintptr_t> &result)
	{
		const auto &children = treeChildren(tree, parent);
		for (const auto child : children) {
			result.push_back(child);
			const auto &node = tree.nodes.at(child);
			if ((node.state & TVIS_EXPANDED) != 0) {
				appendVisibleTreeItems(tree, child, result);
			}
		}
	}

	static std::uint64_t timerKey(
		browser_mfc::WindowId window,
		UINT eventId)
	{
		return (static_cast<std::uint64_t>(window) << 32) | eventId;
	}

	static std::uint64_t scrollKey(
		browser_mfc::WindowId window,
		int scrollBar)
	{
		return (static_cast<std::uint64_t>(window) << 32) |
			static_cast<std::uint32_t>(scrollBar);
	}

	static std::string profileKey(
		const std::string &section,
		const std::string &entry)
	{
		return section + '\0' + entry;
	}

	browser_mfc::MenuId createMenu()
	{
		const auto menu = nextMenuId++;
		menus.emplace(menu, MenuState());
		return menu;
	}

	void appendCommand(
		browser_mfc::MenuId menu,
		UINT command,
		const std::string &text)
	{
		appendMenuItem(menu, MF_STRING, command, text);
	}

	void appendSeparator(browser_mfc::MenuId menu)
	{
		appendMenuItem(menu, MF_SEPARATOR, 0, "");
	}

	void appendSubmenu(
		browser_mfc::MenuId menu,
		browser_mfc::MenuId child,
		const std::string &text)
	{
		appendMenuItem(menu, MF_POPUP, child, text);
	}

	MenuState *findMenu(browser_mfc::MenuId menu)
	{
		const auto found = menus.find(menu);
		return found == menus.end() ? nullptr : &found->second;
	}

	const MenuState *findMenu(browser_mfc::MenuId menu) const
	{
		const auto found = menus.find(menu);
		return found == menus.end() ? nullptr : &found->second;
	}

	static std::vector<MenuItem>::iterator findMenuItem(
		MenuState &menu,
		UINT item,
		UINT flags)
	{
		if ((flags & MF_BYPOSITION) != 0) {
			return item < menu.items.size()
				? menu.items.begin() + static_cast<std::ptrdiff_t>(item)
				: menu.items.end();
		}
		return std::find_if(
			menu.items.begin(),
			menu.items.end(),
			[item](const MenuItem &candidate) {
				return candidate.command == item;
			});
	}

	const MenuItem *findCommand(browser_mfc::MenuId menu, UINT command) const
	{
		const MenuState *state = findMenu(menu);
		if (state == nullptr) return nullptr;
		for (const MenuItem &item : state->items) {
			if (item.command == command) return &item;
			if (item.submenu != 0) {
				const MenuItem *nested = findCommand(item.submenu, command);
				if (nested != nullptr) return nested;
			}
		}
		return nullptr;
	}

	browser_mfc::WindowId nextId = 2;
	browser_mfc::WindowId captured = 0;
	browser_mfc::MenuId nextMenuId = 1;
	browser_mfc::ImageListId nextImageListId = 1;
	std::uintptr_t nextImageHandle = 0x100000;
	UINT nextTimerId = 1;
	std::unordered_map<browser_mfc::WindowId, UINT> dialogResources;
	std::unordered_map<browser_mfc::WindowId, UINT> frameResources;
	std::unordered_map<std::uint64_t, browser_mfc::WindowId> controlIds;
	std::unordered_map<browser_mfc::WindowId, browser_mfc::ControlKind> kinds;
	std::unordered_map<browser_mfc::WindowId, CRect> rectangles;
	std::unordered_map<browser_mfc::WindowId, browser_mfc::WindowId> parents;
	std::unordered_map<browser_mfc::WindowId, browser_mfc::WindowId> windowZAfter;
	std::unordered_map<browser_mfc::WindowId, DWORD> styles;
	std::unordered_map<browser_mfc::WindowId, DWORD> extendedStyles;
	std::unordered_map<browser_mfc::WindowId, std::uintptr_t> windowMenus;
	std::unordered_map<browser_mfc::WindowId, HANDLE> windowImages;
	std::unordered_map<browser_mfc::WindowId, CRect> invalidRectangles;
	std::unordered_map<std::uint64_t, std::pair<int, int>> scrollRanges;
	std::unordered_map<std::uint64_t, int> scrollPositions;
	std::unordered_map<browser_mfc::WindowId, CPoint> scrollDeltas;
	std::vector<std::pair<browser_mfc::WindowId, bool>> printRequests;
	std::unordered_map<browser_mfc::WindowId, std::string> windowClasses;
	std::unordered_map<browser_mfc::WindowId, bool> visibility;
	std::unordered_map<browser_mfc::WindowId, int> showCommands;
	std::unordered_map<browser_mfc::WindowId, bool> minimized;
	std::unordered_map<browser_mfc::WindowId, bool> enabledState;
	std::unordered_map<browser_mfc::WindowId, int> horizontalExtents;
	std::unordered_map<browser_mfc::WindowId, std::vector<ListColumn>> listColumns;
	std::unordered_map<
		browser_mfc::WindowId,
		std::vector<std::vector<std::string>>> listRows;
	std::unordered_map<
		browser_mfc::WindowId,
		std::pair<int, bool>> visibleListItems;
	std::unordered_map<browser_mfc::WindowId, std::pair<int, int>> controlRanges;
	std::unordered_map<browser_mfc::WindowId, int> controlPositions;
	std::unordered_map<browser_mfc::WindowId, int> controlTickFrequencies;
	std::unordered_set<browser_mfc::WindowId> activePaints;
	std::vector<DrawCommand> drawCommands;
	std::vector<ShapeCommand> shapeCommands;
	std::vector<TextCommand> textCommands;
	std::vector<BitmapCommand> bitmapCommands;
	std::vector<IconCommand> iconCommands;
	std::unordered_map<HANDLE, UINT> loadedImages;
	std::unordered_map<browser_mfc::WindowId, TreeState> trees;
	std::unordered_map<browser_mfc::WindowId, TreeLabelEdit> treeLabelEdits;
	std::unordered_map<std::uint64_t, browser_mfc::ImageListId> treeImageLists;
	std::unordered_map<browser_mfc::ImageListId, ImageListState> imageLists;
	std::unordered_map<browser_mfc::ImageListId, UINT> imageListBitmapResources;
	std::unordered_map<browser_mfc::ImageListId, COLORREF> imageListTransparentColors;
	std::unordered_map<
		browser_mfc::WindowId,
		std::vector<std::pair<browser_mfc::WindowId, UINT>>> propertyPages;
	std::unordered_map<browser_mfc::WindowId, unsigned int> selectedPropertyPage;
	std::string fileDialogPath;
	std::unordered_map<browser_mfc::WindowId, std::vector<UINT>> statusIndicators;
	std::unordered_map<browser_mfc::WindowId, UINT> toolbarResources;
	std::unordered_map<browser_mfc::WindowId, DWORD> dockingAlignments;
	std::unordered_map<browser_mfc::WindowId, browser_mfc::WindowId> dockedBars;
	std::unordered_map<browser_mfc::WindowId, FloatingBarState> floatingBars;
	std::unordered_map<std::string, browser_mfc::WindowId> savedBarProfiles;
	std::unordered_map<browser_mfc::WindowId, std::string> frameMessages;
	std::unordered_map<std::uint64_t, UINT> timers;
	std::unordered_map<std::string, int> profileInts;
	std::unordered_map<std::string, std::string> profileStrings;
	std::unordered_map<browser_mfc::WindowId, std::vector<RichFormatRun>> richFormatRuns;
	std::unordered_map<browser_mfc::MenuId, MenuState> menus;
};

class TestCellWidth final : public CellWidth {
public:
	using CellWidth::CellWidth;
	BOOL initialize() { return OnInitDialog(); }
	void accept() { OnOK(); }
};

int main()
{
	InMemoryMfcHost host;
	browser_mfc::setHost(&host);

	TestCellWidth dialog(12);
	if (dialog.Create(CellWidth::IDD) != TRUE) {
		std::cerr << "original CellWidth dialog did not create\n";
		return 1;
	}
	if (host.resourceFor(dialog.browserWindowId()) != IDD_CellWidth) {
		std::cerr << "original CellWidth dialog did not request its original resource\n";
		return 1;
	}
	CWnd *control = dialog.GetDlgItem(IDC_CELL_WIDTH);
	CString initial;
	control->GetWindowText(initial);
	if (initial != "12") {
		std::cerr << "original CellWidth OnInitDialog did not populate the control\n";
		return 1;
	}
	control->SetWindowText("37");
	dialog.accept();
	if (dialog.GetCellWidth() != 37 || dialog.modalResult() != IDOK) {
		std::cerr << "original CellWidth OnOK did not read and accept the browser control\n";
		return 1;
	}
	if (host.closedDialog != dialog.browserWindowId() || host.closedResult != IDOK) {
		std::cerr << "browser MFC host did not observe the original dialog close\n";
		return 1;
	}

	std::cout << "original World Builder CellWidth dialog passed\n";
	return 0;
}
