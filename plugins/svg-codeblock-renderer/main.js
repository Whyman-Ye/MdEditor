const { Plugin, Notice } = require("obsidian");

function sanitizeSvg(svgEl) {
	const scriptNodes = svgEl.querySelectorAll("script");
	for (const node of scriptNodes) {
		node.remove();
	}

	const allNodes = svgEl.querySelectorAll("*");
	for (const node of allNodes) {
		for (const attr of [...node.attributes]) {
			const name = attr.name.toLowerCase();
			const value = (attr.value || "").trim().toLowerCase();
			if (name.startsWith("on")) {
				node.removeAttribute(attr.name);
				continue;
			}
			const isHref = name === "href" || name.endsWith(":href");
			if (isHref && value.startsWith("javascript:")) {
				node.removeAttribute(attr.name);
			}
		}
	}
}

function normalizeInlineSvg(svg) {
	if (!svg.getAttribute("viewBox")) {
		const width = Number.parseFloat(svg.getAttribute("width"));
		const height = Number.parseFloat(svg.getAttribute("height"));
		if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
			svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
		}
	}
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
	svg.removeAttribute("width");
	svg.removeAttribute("height");
	svg.classList.add("svg-codeblock-renderer__svg");
}

function openFullscreenViewer(sourceSvg) {
	const overlay = document.createElement("div");
	overlay.className = "svg-codeblock-viewer";

	const toolbar = document.createElement("div");
	toolbar.className = "svg-codeblock-viewer__toolbar";

	const hint = document.createElement("div");
	hint.className = "svg-codeblock-viewer__hint";
	hint.textContent = "滚轮缩放 | 拖动平移 | 双击重置";

	const resetBtn = document.createElement("button");
	resetBtn.type = "button";
	resetBtn.className = "svg-codeblock-viewer__btn";
	resetBtn.textContent = "重置";

	const closeBtn = document.createElement("button");
	closeBtn.type = "button";
	closeBtn.className = "svg-codeblock-viewer__btn";
	closeBtn.textContent = "关闭";

	toolbar.appendChild(hint);
	toolbar.appendChild(resetBtn);
	toolbar.appendChild(closeBtn);

	const stage = document.createElement("div");
	stage.className = "svg-codeblock-viewer__stage";
	const svg = sourceSvg.cloneNode(true);
	svg.classList.add("svg-codeblock-viewer__svg");
	stage.appendChild(svg);

	overlay.appendChild(toolbar);
	overlay.appendChild(stage);
	document.body.appendChild(overlay);
	document.body.classList.add("svg-codeblock-viewer-open");

	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartViewBoxX = 0;
	let dragStartViewBoxY = 0;

	const MIN_ZOOM_IN_FACTOR = 20;
	const MAX_ZOOM_OUT_FACTOR = 8;
	const ZOOM_STEP = 0.12;

	function parseViewBox() {
		const vb = (svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
		if (vb.length === 4 && vb.every((n) => Number.isFinite(n))) {
			return { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
		}
		return null;
	}

	function setViewBox(vb) {
		svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
	}

	let viewBox = parseViewBox();
	if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
		try {
			const box = svg.getBBox();
			if (box.width > 0 && box.height > 0) {
				viewBox = { x: box.x, y: box.y, width: box.width, height: box.height };
			}
		} catch (_error) {
			// keep fallback below
		}
	}
	if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
		viewBox = { x: 0, y: 0, width: 1000, height: 800 };
	}
	setViewBox(viewBox);

	const initialViewBox = { ...viewBox };
	const minViewBoxWidth = initialViewBox.width / MIN_ZOOM_IN_FACTOR;
	const minViewBoxHeight = initialViewBox.height / MIN_ZOOM_IN_FACTOR;
	const maxViewBoxWidth = initialViewBox.width * MAX_ZOOM_OUT_FACTOR;
	const maxViewBoxHeight = initialViewBox.height * MAX_ZOOM_OUT_FACTOR;

	function clientToSvgPoint(clientX, clientY) {
		const pt = svg.createSVGPoint();
		pt.x = clientX;
		pt.y = clientY;
		const ctm = svg.getScreenCTM();
		if (!ctm) {
			return { x: 0, y: 0 };
		}
		const p = pt.matrixTransform(ctm.inverse());
		return { x: p.x, y: p.y };
	}

	function resetTransform() {
		viewBox = { ...initialViewBox };
		setViewBox(viewBox);
	}

	function onWheel(event) {
		event.preventDefault();
		const zoomIn = event.deltaY < 0;
		const factor = zoomIn ? 1 - ZOOM_STEP : 1 + ZOOM_STEP;

		const mouse = clientToSvgPoint(event.clientX, event.clientY);
		const nextWidth = Math.min(maxViewBoxWidth, Math.max(minViewBoxWidth, viewBox.width * factor));
		const nextHeight = Math.min(maxViewBoxHeight, Math.max(minViewBoxHeight, viewBox.height * factor));

		const widthRatio = nextWidth / viewBox.width;
		const heightRatio = nextHeight / viewBox.height;

		viewBox = {
			x: mouse.x - (mouse.x - viewBox.x) * widthRatio,
			y: mouse.y - (mouse.y - viewBox.y) * heightRatio,
			width: nextWidth,
			height: nextHeight
		};
		setViewBox(viewBox);
	}

	function onMouseDown(event) {
		if (event.button !== 0) {
			return;
		}
		isDragging = true;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartViewBoxX = viewBox.x;
		dragStartViewBoxY = viewBox.y;
		stage.classList.add("is-dragging");
	}

	function onMouseMove(event) {
		if (!isDragging) {
			return;
		}
		const dxClient = event.clientX - dragStartX;
		const dyClient = event.clientY - dragStartY;
		const dxSvg = dxClient * (viewBox.width / Math.max(1, svg.clientWidth));
		const dySvg = dyClient * (viewBox.height / Math.max(1, svg.clientHeight));
		viewBox = {
			...viewBox,
			x: dragStartViewBoxX - dxSvg,
			y: dragStartViewBoxY - dySvg
		};
		setViewBox(viewBox);
	}

	function onMouseUp() {
		if (!isDragging) {
			return;
		}
		isDragging = false;
		stage.classList.remove("is-dragging");
	}

	function closeViewer() {
		stage.removeEventListener("wheel", onWheel);
		stage.removeEventListener("mousedown", onMouseDown);
		stage.removeEventListener("dblclick", resetTransform);
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
		document.removeEventListener("keydown", onKeydown);
		resetBtn.removeEventListener("click", resetTransform);
		closeBtn.removeEventListener("click", closeViewer);
		overlay.removeEventListener("click", onOverlayClick);
		overlay.remove();
		document.body.classList.remove("svg-codeblock-viewer-open");
	}

	function onOverlayClick(event) {
		if (event.target === overlay) {
			closeViewer();
		}
	}

	function onKeydown(event) {
		if (event.key === "Escape") {
			closeViewer();
		}
	}

	stage.addEventListener("wheel", onWheel, { passive: false });
	stage.addEventListener("mousedown", onMouseDown);
	stage.addEventListener("dblclick", resetTransform);
	document.addEventListener("mousemove", onMouseMove);
	document.addEventListener("mouseup", onMouseUp);
	document.addEventListener("keydown", onKeydown);
	resetBtn.addEventListener("click", resetTransform);
	closeBtn.addEventListener("click", closeViewer);
	overlay.addEventListener("click", onOverlayClick);

	resetTransform();
}

module.exports = class SvgCodeblockRendererPlugin extends Plugin {
	onload() {
		this.registerMarkdownCodeBlockProcessor("svg", (source, el) => {
			try {
				const content = source.trim();
				if (!content) {
					el.setText("SVG code block is empty.");
					return;
				}

				const parser = new DOMParser();
				const svgDoc = parser.parseFromString(content, "image/svg+xml");
				if (svgDoc.querySelector("parsererror")) {
					throw new Error("Invalid SVG markup.");
				}

				const svg = svgDoc.documentElement;
				if (!svg || svg.tagName.toLowerCase() !== "svg") {
					throw new Error("SVG code block must start with <svg>.");
				}

				sanitizeSvg(svg);
				normalizeInlineSvg(svg);

				el.empty();
				el.addClass("svg-codeblock-renderer");
				const frame = el.createDiv({ cls: "svg-codeblock-renderer__frame" });
				const tip = el.createDiv({ cls: "svg-codeblock-renderer__tip", text: "单击全屏查看" });
				frame.appendChild(svg);
				frame.appendChild(tip);

				frame.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					openFullscreenViewer(svg);
				});
			} catch (error) {
				console.error("[svg-codeblock-renderer] render failed:", error);
				new Notice("SVG 渲染失败，请检查 ```svg 代码内容。");
				el.empty();
				el.createEl("pre", { text: source });
			}
		});
	}
};
