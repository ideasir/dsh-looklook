window.__ModuleLoader__.load({
	id: "dsh-looklook",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_attachment = require("@deepseek-ai/dsh-client-ui-attachment");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/settings-view.ts
		/** Shared client helpers for reading plugin settings namespaces over the wire. */
		/**
		* Find one namespace entry in a settings `describe()` result and return its
		* value, or undefined when absent.
		* @param namespaces - the wire `namespaces` array from `api.settings.describe`.
		* @param ns - the namespace name to look up (e.g. 'vision', 'looklook').
		*/
		function namespaceValueOf(namespaces, ns) {
			if (!Array.isArray(namespaces)) return void 0;
			const entry = namespaces.find((namespace) => typeof namespace === "object" && namespace !== null && namespace.ns === ns);
			const value = entry !== void 0 ? entry.value : void 0;
			return typeof value === "object" && value !== null ? value : void 0;
		}
		//#endregion
		//#region src/client/eye-controller.ts
		/** Create the controller for one session. */
		function createEyeController(api, sessionId) {
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({ status: "loading" });
			const refresh = async () => {
				const response = await api.describe();
				if (!response.ok) {
					store.set({
						status: "ready",
						eye: "on",
						unconfigured: true
					});
					return;
				}
				const vision = namespaceValueOf(response.namespaces, "vision");
				const eye = vision?.sessionOverrides?.[sessionId] ?? "on";
				const unconfigured = !(vision?.providers ?? []).some((provider) => provider.enabled !== false);
				store.set({
					status: "ready",
					eye,
					unconfigured
				});
			};
			return {
				store,
				load: () => {
					refresh();
				},
				toggle: (next) => {
					(async () => {
						await api.update("vision", { sessionOverrides: { [sessionId]: next } });
						refresh();
					})();
				}
			};
		}
		//#endregion
		//#region src/client/feature-controller.ts
		/** Create the plugin master-switch controller. */
		function createFeatureController(api) {
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({ status: "loading" });
			const refresh = async () => {
				const response = await api.describe();
				if (!response.ok) {
					store.set({
						status: "ready",
						enabled: true
					});
					return;
				}
				const value = namespaceValueOf(response.namespaces, "looklook");
				store.set({
					status: "ready",
					enabled: value?.enabled !== false
				});
			};
			const update = async (patch) => {
				await api.update("looklook", patch);
				refresh();
			};
			return {
				store,
				load: () => {
					refresh();
				},
				setEnabled: (next) => {
					update({ enabled: next });
				}
			};
		}
		//#endregion
		//#region src/client/pending-files.ts
		/** Create the pending-files controller. */
		function createPendingFilesController() {
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({});
			const get = (sessionId) => store.getSnapshot()[sessionId] ?? [];
			let seq = 0;
			return {
				store,
				add: (sessionId, file) => {
					const id = `f${Date.now().toString(36)}_${(seq++).toString(36)}`;
					store.set({
						...store.getSnapshot(),
						[sessionId]: [...get(sessionId), {
							...file,
							id
						}]
					});
				},
				updateById: (sessionId, id, patch) => {
					const list = get(sessionId);
					if (!list.some((item) => item.id === id)) return;
					const next = list.map((item) => item.id === id ? {
						...item,
						...patch
					} : item);
					store.set({
						...store.getSnapshot(),
						[sessionId]: next
					});
				},
				remove: (sessionId, id) => {
					const next = get(sessionId).filter((item) => item.id !== id);
					const state = { ...store.getSnapshot() };
					if (next.length > 0) state[sessionId] = next;
					else delete state[sessionId];
					store.set(state);
				},
				clear: (sessionId) => {
					store.set({
						...store.getSnapshot(),
						[sessionId]: []
					});
				},
				get
			};
		}
		//#endregion
		//#region src/client/format.ts
		/** Shared client formatting helpers. */
		/** Human-readable byte size (B / KB / MB). */
		function formatSize(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1048576).toFixed(1)} MB`;
		}
		//#endregion
		//#region src/client/FileTypeIcon.tsx
		/**
		* FileTypeIcon — one inline SVG glyph per file-type family (zip / psd / pdf /
		* office / video / generic). Shared by the pending chips (FileChips) and the
		* sent-message attachment cards (UserMessageNodeView) so both look native and
		* consistent. No external dependencies.
		*/
		/** The icon glyph for one file name (by extension family). */
		function FileTypeIcon({ name, size = 20 }) {
			const lower = name.toLowerCase();
			const fill = "currentColor";
			const stroke = "currentColor";
			if (lower.endsWith(".zip") || lower.endsWith(".7z") || lower.endsWith(".rar")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 8h16v12H4z",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 8l3-4h10l3 4",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M9 13l6-2M9 15l6-2",
						stroke,
						strokeWidth: "1.6",
						strokeLinecap: "round"
					})
				]
			});
			if (lower.endsWith(".psd")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "7",
						cy: "8",
						r: "2.4",
						fill,
						opacity: "0.8"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "17",
						cy: "6.5",
						r: "2",
						fill,
						opacity: "0.6"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "13",
						cy: "16",
						r: "2.8",
						fill,
						opacity: "0.7"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3 21l5.5-8L13 16l4-5 4 10H3z",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					})
				]
			});
			if (lower.endsWith(".pdf")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M6 3h9l4 4v14H6z",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M15 3v4h4",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
						x: "12",
						y: "17",
						textAnchor: "middle",
						fontSize: "8",
						fontWeight: "700",
						fill,
						children: "PDF"
					})
				]
			});
			if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "4",
					y: "4",
					width: "16",
					height: "16",
					rx: "2.5",
					stroke,
					strokeWidth: "1.6"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 13l2.6-3 2.4 2 2-2.5L18 13",
					stroke,
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				})]
			});
			if (lower.endsWith(".docx") || lower.endsWith(".doc") || lower.endsWith(".xlsx") || lower.endsWith(".xls")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M6 3h9l4 4v14H6z",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M15 3v4h4",
						stroke,
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M9.5 14h5M9.5 17h5",
						stroke,
						strokeWidth: "1.5",
						strokeLinecap: "round"
					})
				]
			});
			if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".avi") || lower.endsWith(".mkv") || lower.endsWith(".webm")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "3",
					y: "5",
					width: "18",
					height: "14",
					rx: "2.5",
					stroke,
					strokeWidth: "1.6"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10 9.5l5 2.5-5 2.5z",
					fill
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M6 3h9l4 4v14H6z",
					stroke,
					strokeWidth: "1.6",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M15 3v4h4",
					stroke,
					strokeWidth: "1.6",
					strokeLinejoin: "round"
				})]
			});
		}
		//#endregion
		//#region src/client/UserMessageNodeView.tsx
		/**
		* LooklookUserMessageNodeView — replaces the default user-message bubble so
		* the chat renders the ORIGINAL image the user sent, even though the session
		* record only carries the plugin's rewritten text (rc.6 rewrites the record).
		*
		* Thumbnail rule (fixed size): square → 220×220; landscape → height 220;
		* portrait → width 220 (aspect-preserving, never upscaled). Click opens the
		* native lightbox. The host embeds a full image-reference JSON in the marker
		* 「【附图:{...}】」 and wraps its model-facing tool-reference text in
		* 「【looklook:开始】…【looklook:结束】」 (hidden from the user). Defensive:
		* unexpected shapes fall back to plain text, never crashing the chat.
		*/
		/** The host's attachment marker: 「【附图:<ref-json-or-id>】」. */
		const IMAGE_MARKER_RE = /【附图:([^】]+)】/g;
		/** Host hide delimiters: strip everything between them before display. */
		const HIDE_START = "【looklook:开始】";
		const HIDE_END = "【looklook:结束】";
		/** Host file marker: 「【looklook:file】{json}【looklook:file】」. */
		const FILE_MARKER_RE = /【looklook:file】([\s\S]*?)【looklook:file】/g;
		/** Clean upload note written by the current client: 「[类型]name 排队中...」. */
		const CLEAN_NOTE_RE = /\[(图片|视频|压缩包|文档|文件)\]([^\n]+?)(?:\s*排队中\.\.\.)?\s*(?=\n|$)/g;
		const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
		/** Whether a file marker's name looks like an image (thumbnail-able). */
		function isImageFileMeta(file) {
			return IMAGE_EXT_RE.test(file.name);
		}
		/** One image file card: local thumbnail from the uploaded bytes + lightbox. */
		function UploadImageCard({ sessionId, file, load }) {
			const [src, setSrc] = (0, react.useState)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let live = true;
				setFailed(false);
				load(sessionId, file.name).then((result) => {
					if (!live) return;
					if (result.ok) setSrc(`data:${result.mediaType};base64,${result.data}`);
					else setFailed(true);
				}).catch(() => {
					if (live) setFailed(true);
				});
				return () => {
					live = false;
				};
			}, [
				sessionId,
				file.name,
				load
			]);
			if (failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileCard, { file });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => {
					if (src !== null) setOpen(true);
				},
				"aria-label": "查看原图",
				style: {
					padding: 0,
					border: 0,
					background: "none",
					cursor: src !== null ? "pointer" : "default",
					lineHeight: 0
				},
				children: src === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						width: 120,
						height: 90,
						borderRadius: 8,
						background: "rgba(128,128,128,0.1)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "#888",
						fontSize: 12
					},
					children: "加载中…"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: file.name,
					style: {
						maxWidth: 220,
						maxHeight: 220,
						borderRadius: 8,
						objectFit: "cover",
						display: "block"
					}
				})
			}), open && src !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_attachment.ImageLightbox, {
				src,
				alt: file.name,
				labels: LIGHTBOX_LABELS,
				onClose: () => setOpen(false)
			})] });
		}
		/** A rendered attachment card: type icon + name + size. */
		function FileCard({ file }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 8,
					maxWidth: 320,
					padding: "8px 12px",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 10,
					background: "var(--dsw-alias-bg-layer-2)",
					fontSize: 13,
					color: "var(--dsw-alias-label-primary)"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						display: "grid",
						placeItems: "center",
						flex: "none",
						color: "var(--dsw-alias-brand-primary)"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileTypeIcon, { name: file.name })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "flex",
						flexDirection: "column",
						minWidth: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							fontWeight: 500
						},
						children: file.name
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: formatSize(file.size)
					})]
				})]
			});
		}
		/** Thumbnail fixed dimension (short side cap). */
		const THUMB_MAX = 220;
		/** Lightbox strings. */
		const LIGHTBOX_LABELS = {
			dialog: "图片预览",
			close: "关闭预览"
		};
		/** Compute the thumbnail box: square 220×220; landscape height 220; portrait
		* width 220; never upscale (natural size when smaller). Missing metadata falls
		* back to a 220 square. */
		function thumbSize(width, height) {
			if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return {
				width: THUMB_MAX,
				height: THUMB_MAX
			};
			const shortSide = Math.min(width, height);
			if (shortSide >= THUMB_MAX) {
				const scale = THUMB_MAX / shortSide;
				return {
					width: Math.round(width * scale),
					height: Math.round(height * scale)
				};
			}
			return {
				width,
				height
			};
		}
		/** One fixed-size thumbnail with click-to-open lightbox. */
		function LooklookThumb({ attachment, load }) {
			const [src, setSrc] = (0, react.useState)(null);
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let live = true;
				setSrc(null);
				load(attachment).then((url) => {
					if (live) setSrc(url);
				}).catch(() => {});
				return () => {
					live = false;
				};
			}, [attachment, load]);
			const box = thumbSize(attachment.width, attachment.height);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => {
					if (src !== null) setOpen(true);
				},
				"aria-label": "查看原图",
				style: {
					padding: 0,
					border: 0,
					background: "none",
					cursor: "pointer",
					lineHeight: 0
				},
				children: src === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...box,
						borderRadius: 8,
						background: "rgba(128,128,128,0.1)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "#888",
						fontSize: 12,
						lineHeight: 1.4
					},
					children: "加载中…"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: "图片",
					style: {
						...box,
						objectFit: "cover",
						borderRadius: 8,
						display: "block"
					}
				})
			}), open && src !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_attachment.ImageLightbox, {
				src,
				alt: "图片",
				labels: LIGHTBOX_LABELS,
				onClose: () => setOpen(false)
			})] });
		}
		/** Remove every host hidden range (tool references are model-facing only). */
		function stripHidden(text) {
			let out = text;
			for (;;) {
				const start = out.indexOf(HIDE_START);
				if (start === -1) break;
				const end = out.indexOf(HIDE_END, start);
				if (end === -1) {
					out = out.slice(0, start);
					break;
				}
				out = out.slice(0, start) + out.slice(end + 13);
			}
			return out;
		}
		/** Parse a marker payload: full ref JSON, or a bare attachmentId fallback. */
		function parseMarkerRef(raw) {
			const trimmed = raw.trim();
			try {
				const parsed = JSON.parse(trimmed);
				if (typeof parsed?.attachmentId === "string" && parsed.attachmentId.length > 0) return {
					attachmentId: parsed.attachmentId,
					mediaType: typeof parsed.mediaType === "string" ? parsed.mediaType : "image/png",
					bytes: typeof parsed.bytes === "number" ? parsed.bytes : 0,
					width: typeof parsed.width === "number" ? parsed.width : 0,
					height: typeof parsed.height === "number" ? parsed.height : 0
				};
			} catch {}
			return { attachmentId: trimmed };
		}
		/** The host's image-reference JSON embedded in the hidden tool text. */
		const REF_JSON_RE = /(\{"attachmentId":"[^"]+","mediaType":"[^"]+","bytes":\d+,"width":\d+,"height":\d+\})/g;
		/**
		* Collect every image reference embedded in the raw (pre-strip) text, keyed
		* by attachmentId. Lets legacy bare-id markers also render at their true
		* aspect ratio (the full ref lives in the hidden tool-reference text).
		*/
		function collectEmbeddedRefs(rawText) {
			const map = /* @__PURE__ */ new Map();
			for (const match of rawText.matchAll(REF_JSON_RE)) {
				const raw = match[1];
				if (raw === void 0) continue;
				try {
					const parsed = JSON.parse(raw);
					if (typeof parsed?.attachmentId === "string" && parsed.attachmentId.length > 0) map.set(parsed.attachmentId, {
						attachmentId: parsed.attachmentId,
						mediaType: typeof parsed.mediaType === "string" ? parsed.mediaType : "image/png",
						bytes: typeof parsed.bytes === "number" ? parsed.bytes : 0,
						width: typeof parsed.width === "number" ? parsed.width : 0,
						height: typeof parsed.height === "number" ? parsed.height : 0
					});
				} catch {}
			}
			return map;
		}
		/**
		* Defensive user-message renderer: fixed-size thumbnails + native lightbox,
		* only the user's own text shown; falls back to plain text on unexpected shapes.
		* The fallback ALWAYS strips looklook markers (hidden ranges + file/image
		* markers) so raw marker code never flashes before the structured render.
		*/
		function LooklookUserMessageNodeView(props) {
			const content = props.node?.data?.content;
			if (!Array.isArray(content)) {
				const fallback = content?.text;
				if (typeof fallback !== "string") return null;
				const stripped = stripHidden(fallback.replace(FILE_MARKER_RE, "").replace(IMAGE_MARKER_RE, "")).trim();
				return stripped.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						whiteSpace: "pre-wrap",
						wordBreak: "break-word"
					},
					children: stripped
				});
			}
			const texts = [];
			const attachments = [];
			const files = [];
			const rawBlocks = [];
			for (const raw of content) {
				const block = raw;
				if (block?.type === "text" && typeof block.text === "string") {
					rawBlocks.push(block.text);
					texts.push(stripHidden(block.text));
				} else if (block?.type === "image" && typeof block.attachment?.attachmentId === "string") attachments.push(block.attachment);
			}
			const embeddedRefs = collectEmbeddedRefs(rawBlocks.join(""));
			const trimmed = texts.join("").replace(FILE_MARKER_RE, (_all, payload) => {
				try {
					const parsed = JSON.parse(payload);
					if (typeof parsed?.name === "string" && typeof parsed?.path === "string") files.push({
						name: parsed.name,
						path: parsed.path,
						size: typeof parsed.size === "number" ? parsed.size : 0
					});
				} catch {}
				return "";
			}).replace(IMAGE_MARKER_RE, (_all, payload) => {
				const parsed = parseMarkerRef(payload);
				const withMeta = embeddedRefs.get(parsed.attachmentId);
				attachments.push(withMeta ?? parsed);
				return "";
			}).replace(CLEAN_NOTE_RE, (_all, _label, name) => {
				files.push({
					name: name.trim(),
					path: "",
					size: 0
				});
				return "";
			}).trim();
			if (attachments.length === 0 && files.length === 0 && trimmed.length === 0) return null;
			const seenAttachmentIds = /* @__PURE__ */ new Set();
			const uniqueAttachments = attachments.filter((item) => {
				if (seenAttachmentIds.has(item.attachmentId)) return false;
				seenAttachmentIds.add(item.attachmentId);
				return true;
			});
			const load = props.loadImage ?? (() => Promise.reject(/* @__PURE__ */ new Error("image loader unavailable")));
			const loadUpload = props.loadUpload;
			const sessionId = props.sessionId ?? "";
			const imageFiles = loadUpload !== void 0 ? files.filter((file) => isImageFileMeta(file)) : [];
			const otherFiles = files.filter((file) => !imageFiles.includes(file));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: 6,
					margin: "8px 0"
				},
				children: [
					files.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							justifyContent: "flex-end"
						},
						children: [imageFiles.map((file, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadImageCard, {
							sessionId,
							file,
							load: loadUpload
						}, `${file.path}-${index}`)), otherFiles.map((file, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileCard, { file }, `${file.path}-${index}`))]
					}),
					uniqueAttachments.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							justifyContent: "flex-end"
						},
						children: uniqueAttachments.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LooklookThumb, {
							attachment: item,
							load
						}, item.attachmentId))
					}),
					trimmed.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							maxWidth: "80%",
							background: "rgba(128,128,128,0.14)",
							padding: "8px 12px",
							borderRadius: 12,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word"
						},
						children: trimmed
					})
				]
			});
		}
		//#endregion
		//#region src/client/Features.tsx
		const css$3 = {
			stack: {
				display: "flex",
				flexDirection: "column",
				gap: 14,
				color: "var(--dsw-alias-label-primary)"
			},
			section: {
				display: "flex",
				flexDirection: "column",
				gap: 10
			},
			heading: {
				fontSize: 12,
				lineHeight: "18px",
				fontWeight: 600,
				color: "var(--dsw-alias-label-secondary)",
				letterSpacing: "0.02em"
			},
			row: {
				display: "flex",
				alignItems: "center",
				gap: 14
			},
			rowText: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0,
				flex: 1
			},
			rowName: {
				fontSize: 14,
				lineHeight: "22px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)"
			},
			rowDesc: {
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			hint: {
				fontSize: 11,
				lineHeight: "17px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			grid: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
				gap: 8
			},
			typeCard: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "8px 10px",
				border: "1px solid var(--dsw-alias-border-l1)",
				borderRadius: 10,
				background: "var(--dsw-alias-bg-layer-1)"
			},
			typeIcon: {
				flex: "none",
				display: "grid",
				placeItems: "center",
				color: "var(--dsw-alias-brand-primary)",
				fontSize: 18
			},
			typeName: {
				fontSize: 12,
				lineHeight: "18px",
				fontWeight: 500
			},
			platforms: {
				fontSize: 11,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)",
				display: "flex",
				flexWrap: "wrap",
				gap: "2px 8px"
			}
		};
		/** Slider-style switch (track + knob), smooth spring motion, perfectly centered knob. */
		function SliderSwitch({ checked, onChange, label }) {
			const trackW = 44;
			const trackH = 24;
			const knob = 18;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				onClick: () => onChange(!checked),
				style: {
					flex: "none",
					position: "relative",
					width: trackW,
					height: trackH,
					borderRadius: 999,
					border: "none",
					cursor: "pointer",
					padding: 0,
					background: checked ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-border-l3)",
					transition: "background .18s cubic-bezier(0.4, 0, 0.2, 1)",
					boxShadow: checked ? "inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent)" : "none"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
					position: "absolute",
					top: 3,
					left: checked ? 23 : 3,
					width: knob,
					height: knob,
					borderRadius: 999,
					background: "#fff",
					boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
					transition: "left .2s cubic-bezier(0.34, 1.56, 0.64, 1)"
				} })
			});
		}
		/** One supported content type with an emoji icon. */
		const SUPPORTED_TYPES = [
			{
				icon: "🖼️",
				name: "图片 / 图像"
			},
			{
				icon: "🎬",
				name: "视频"
			},
			{
				icon: "🔊",
				name: "声音"
			},
			{
				icon: "🎨",
				name: "PSD"
			},
			{
				icon: "📄",
				name: "DOC"
			},
			{
				icon: "📊",
				name: "Excel"
			},
			{
				icon: "📽️",
				name: "PPT"
			},
			{
				icon: "📕",
				name: "PDF"
			}
		];
		/** Supported video platforms (compact list under the format grid). */
		const SUPPORTED_PLATFORMS = [
			"抖音",
			"B 站",
			"YouTube",
			"西瓜视频",
			"快手",
			"微博视频",
			"优酷",
			"腾讯视频",
			"爱奇艺",
			"更多 yt-dlp 支持的平台"
		];
		/** The plugin-card body. */
		function LooklookFeaturesSection(props) {
			const { t, features, useFeatures } = props;
			const state = useFeatures();
			const enabled = state.status === "ready" && state.enabled;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: css$3.stack,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: css$3.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: css$3.heading,
							children: t("features.switches.heading")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: css$3.row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderSwitch, {
								checked: enabled,
								onChange: (next) => features.setEnabled(next),
								label: t("features.master.label")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: css$3.rowText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$3.rowName,
									children: t("features.master.label")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$3.rowDesc,
									children: t("features.master.desc")
								})]
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: css$3.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: css$3.heading,
							children: t("features.supported.heading")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: css$3.grid,
							children: SUPPORTED_TYPES.map((type) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: css$3.typeCard,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$3.typeIcon,
									children: type.icon
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$3.typeName,
									children: type.name
								})]
							}, type.name))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: css$3.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: css$3.heading,
							children: t("features.platforms.heading")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: css$3.platforms,
							children: SUPPORTED_PLATFORMS.map((platform, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [index > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { color: "var(--dsw-alias-border-l3)" },
								children: " · "
							}), platform] }, platform))
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/ProviderListEditor.tsx
		/**
		* ProviderListEditor — a reusable provider-list editor (primary + fallbacks,
		* failover order) for one settings namespace. Used by the looklook card for
		* both the vision model list and the audio model list.
		*
		* Edits are draft-local until Save, which writes credentials (per-provider
		* API key) and the namespace's `providers` in one commit. Model discovery
		* (fetch /models) is optional and provided by the caller.
		*/
		/** Derive a credential reference for one provider id. */
		function credentialRefFor(id) {
			return `LOOKLOOK_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
		}
		function newProviderId() {
			return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
		}
		const layout = {
			section: {
				display: "flex",
				flexDirection: "column",
				gap: 12,
				maxWidth: 720,
				color: "var(--dsw-alias-label-primary)"
			},
			title: {
				margin: 0,
				fontSize: 16,
				lineHeight: "24px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)"
			},
			intro: {
				margin: 0,
				fontSize: 14,
				lineHeight: "22px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			hint: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			saved: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-state-success-primary)"
			},
			error: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-state-warn-label)"
			},
			card: {
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 12,
				padding: "12px 14px",
				display: "flex",
				flexDirection: "column",
				gap: 12
			},
			rowHead: {
				display: "flex",
				alignItems: "center",
				gap: 10
			},
			rowIdentity: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0
			},
			rowName: {
				fontSize: 14,
				lineHeight: "22px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)"
			},
			rowTag: {
				flex: "none",
				padding: "1px 6px",
				border: "1px solid var(--dsw-alias-border-l3)",
				borderRadius: 4,
				fontSize: 11,
				lineHeight: "16px",
				color: "var(--dsw-alias-label-secondary)"
			},
			rowMeta: {
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			rowActions: {
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				marginLeft: "auto"
			},
			editor: {
				borderRadius: 12,
				background: "var(--dsw-alias-bg-module-platform)",
				padding: "14px 16px",
				display: "flex",
				flexDirection: "column",
				gap: 14
			},
			field: {
				display: "flex",
				flexDirection: "column",
				gap: 6
			},
			fieldLabel: {
				display: "inline-flex",
				alignItems: "center",
				gap: 10,
				fontSize: 12,
				lineHeight: "18px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-secondary)"
			},
			footer: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginTop: 4
			},
			input: {
				boxSizing: "border-box",
				width: "100%",
				height: 32,
				padding: "0 10px",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 8,
				font: "inherit",
				fontSize: 14,
				lineHeight: "22px",
				background: "var(--dsw-alias-bg-layer-1)",
				color: "var(--dsw-alias-label-primary)"
			}
		};
		/**
		* The full provider-list editor. Every state hook lives here; the caller
		* mounts it once per namespace (visual / audio).
		*/
		function ProviderListEditor(props) {
			const { api, pluginSettings, t, ns, title, intro, listModels, testModel, testLabel } = props;
			const [providers, setProviders] = (0, react.useState)([]);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const [editingId, setEditingId] = (0, react.useState)(null);
			const [addDraft, setAddDraft] = (0, react.useState)(null);
			const [fetching, setFetching] = (0, react.useState)(null);
			const [fetchedModels, setFetchedModels] = (0, react.useState)({});
			const [fetchError, setFetchError] = (0, react.useState)(null);
			const [keyStates, setKeyStates] = (0, react.useState)({});
			const [testing, setTesting] = (0, react.useState)(null);
			const [testResult, setTestResult] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				(async () => {
					const response = await pluginSettings.describe();
					if (response.ok) {
						const value = namespaceValueOf(response.namespaces, ns);
						const loaded = Array.isArray(value?.providers) ? value.providers : [];
						setProviders(loaded);
						const refs = loaded.map((provider) => credentialRefFor(provider.id));
						if (refs.length > 0) {
							const cred = await pluginSettings.describeCredentials(refs);
							if (cred.ok) {
								const next = {};
								for (const provider of loaded) next[provider.id] = cred.credentials[credentialRefFor(provider.id)]?.configured === true;
								setKeyStates(next);
							}
						}
					}
					setLoaded(true);
				})();
			}, [api, ns]);
			const primaryId = (0, react.useMemo)(() => providers.find((provider) => provider.enabled)?.id, [providers]);
			const editing = editingId === null ? void 0 : providers.find((provider) => provider.id === editingId);
			const patch = (id, next) => {
				setProviders((current) => current.map((provider) => provider.id === id ? {
					...provider,
					...next
				} : provider));
			};
			const move = (id, offset) => {
				setProviders((current) => {
					const index = current.findIndex((provider) => provider.id === id);
					const target = index + offset;
					if (index < 0 || target < 0 || target >= current.length) return current;
					const next = [...current];
					const [item] = next.splice(index, 1);
					if (item === void 0) return current;
					next.splice(target, 0, item);
					return next;
				});
			};
			const remove = (id) => {
				setProviders((current) => current.filter((provider) => provider.id !== id));
				if (editingId === id) setEditingId(null);
			};
			const closeEditor = () => {
				setEditingId(null);
				setAddDraft(null);
				setFetchError(null);
			};
			const fetchModels = async (draft) => {
				if (listModels === void 0) return;
				setFetchError(null);
				setFetching(draft.id);
				try {
					if (typeof draft.baseURL !== "string" || draft.baseURL.trim() === "") {
						setFetchError(t("settings.provider.baseURLRequired"));
						return;
					}
					const result = await listModels({
						baseURL: draft.baseURL,
						apiKeyEnv: credentialRefFor(draft.id),
						...draft.apiKey !== void 0 && draft.apiKey !== "" ? { apiKey: draft.apiKey } : {}
					});
					if (result.ok) setFetchedModels((current) => ({
						...current,
						[draft.id]: result.models
					}));
					else {
						const rawError = result.error;
						const message = typeof rawError === "string" ? rawError : rawError !== null && typeof rawError === "object" && "message" in rawError ? String(rawError.message) : JSON.stringify(rawError);
						setFetchError(message);
					}
				} catch (error) {
					setFetchError(error instanceof Error ? error.message : String(error));
				} finally {
					setFetching(null);
				}
			};
			/** Run the model capability probe (vision see-image / audio L1-L2). */
			const testProvider = async (draft) => {
				if (testModel === void 0) return;
				setTesting(draft.id);
				setTestResult(null);
				try {
					if (typeof draft.baseURL !== "string" || draft.baseURL.trim() === "") {
						setTestResult({
							id: draft.id,
							ok: false,
							text: t("settings.provider.baseURLRequired")
						});
						return;
					}
					if (typeof draft.model !== "string" || draft.model.trim() === "") {
						setTestResult({
							id: draft.id,
							ok: false,
							text: "请先填写模型名"
						});
						return;
					}
					const result = await testModel({
						baseURL: draft.baseURL,
						apiKeyEnv: credentialRefFor(draft.id),
						model: draft.model,
						...draft.apiKey !== void 0 && draft.apiKey !== "" ? { apiKey: draft.apiKey } : {}
					});
					if (result.ok) setTestResult({
						id: draft.id,
						ok: true,
						text: result.message
					});
					else setTestResult({
						id: draft.id,
						ok: false,
						text: result.error
					});
				} catch (error) {
					setTestResult({
						id: draft.id,
						ok: false,
						text: error instanceof Error ? error.message : String(error)
					});
				} finally {
					setTesting(null);
				}
			};
			const save = async () => {
				setSaving(true);
				setNotice(null);
				try {
					const nextProviders = addDraft === null ? providers : [...providers, addDraft];
					const freshKeys = nextProviders.filter((provider) => provider.apiKey !== void 0 && provider.apiKey.length > 0);
					for (const provider of freshKeys) {
						const stored = await pluginSettings.setCredential(credentialRefFor(provider.id), provider.apiKey ?? "");
						if (!stored.ok) throw new Error(stored.error);
					}
					const update = await pluginSettings.update(ns, { providers: nextProviders.map(({ id, name, baseURL, model, enabled }) => ({
						id,
						name,
						baseURL,
						model,
						enabled,
						apiKeyEnv: credentialRefFor(id)
					})) });
					if (!update.ok) throw new Error(update.error);
					setProviders(nextProviders.map((provider) => ({
						id: provider.id,
						name: provider.name,
						baseURL: provider.baseURL,
						model: provider.model,
						enabled: provider.enabled
					})));
					if (freshKeys.length > 0) setKeyStates((current) => {
						const next = { ...current };
						for (const provider of freshKeys) next[provider.id] = true;
						return next;
					});
					setNotice({
						kind: "saved",
						text: t("settings.saved")
					});
					closeEditor();
				} catch (error) {
					setNotice({
						kind: "error",
						text: `${t("settings.saveFailed")}：${error instanceof Error ? error.message : String(error)}`
					});
				} finally {
					setSaving(false);
				}
			};
			const renderEditor = (draft, onPatch) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: layout.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: layout.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							style: layout.fieldLabel,
							children: t("settings.provider.name")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: layout.input,
							value: draft.name,
							placeholder: t("settings.provider.nameHint"),
							onChange: (event) => onPatch({ name: event.target.value })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: layout.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							style: layout.fieldLabel,
							children: t("settings.provider.baseURL")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: layout.input,
							value: draft.baseURL,
							placeholder: t("settings.provider.baseURLHint"),
							onChange: (event) => onPatch({ baseURL: event.target.value })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: layout.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								style: layout.fieldLabel,
								children: t("settings.provider.model")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: layout.input,
								list: `looklook-models-${draft.id}`,
								value: draft.model,
								placeholder: t("settings.provider.modelHint"),
								onChange: (event) => onPatch({ model: event.target.value })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
								id: `looklook-models-${draft.id}`,
								children: (fetchedModels[draft.id] ?? []).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value: model }, model))
							}),
							(fetchedModels[draft.id] ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: layout.hint,
								children: t("settings.provider.modelsFetched")
							}),
							(listModels !== void 0 || testModel !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									flexWrap: "wrap"
								},
								children: [
									listModels !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										size: "sm",
										disabled: fetching === draft.id,
										onClick: () => void fetchModels(draft),
										children: fetching === draft.id ? "…" : t("settings.provider.fetchModels")
									}),
									testModel !== void 0 && testLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										size: "sm",
										disabled: testing === draft.id,
										onClick: () => void testProvider(draft),
										children: testing === draft.id ? "测试中…" : testLabel
									}),
									fetchError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: layout.error,
										children: fetchError
									}),
									testResult !== null && testResult.id === draft.id && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: testResult.ok ? layout.hint : layout.error,
										"aria-live": "polite",
										children: testResult.text
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: layout.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							style: layout.fieldLabel,
							children: t("settings.provider.apiKey")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: layout.input,
							type: "password",
							autoComplete: "off",
							value: draft.apiKey ?? "",
							placeholder: keyStates[draft.id] ? t("settings.provider.apiKeyConfigured") : t("settings.provider.apiKeyUnset"),
							onChange: (event) => onPatch({ apiKey: event.target.value })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: layout.field,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								...layout.fieldLabel,
								cursor: "pointer"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: draft.enabled,
								onChange: (event) => onPatch({ enabled: event.target.checked })
							}), t("settings.provider.enabled")]
						})
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: layout.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: layout.title,
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: layout.intro,
						children: intro
					}),
					loaded && providers.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: layout.hint,
						children: t("settings.provider.empty")
					}),
					providers.map((provider) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...layout.card,
							cursor: "pointer"
						},
						role: "button",
						tabIndex: 0,
						onClick: () => setEditingId(provider.id),
						onKeyDown: (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								setEditingId(provider.id);
							}
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: layout.rowHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: layout.rowIdentity,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: layout.rowName,
										children: provider.name || provider.id
									}), provider.id === primaryId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: layout.rowTag,
										children: t("settings.provider.primary")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: layout.rowTag,
										children: t("settings.provider.fallback")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										...layout.rowActions,
										cursor: "default"
									},
									onClick: (event) => event.stopPropagation(),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: keyStates[provider.id] ? "done" : "warning" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											"aria-label": t("settings.provider.moveUp"),
											disabled: provider.id === providers[0]?.id,
											onClick: () => move(provider.id, -1),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											"aria-label": t("settings.provider.moveDown"),
											disabled: provider.id === providers[providers.length - 1]?.id,
											onClick: () => move(provider.id, 1),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											"aria-label": t("settings.provider.name"),
											onClick: () => setEditingId(provider.id),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											"aria-label": t("settings.provider.remove"),
											onClick: () => remove(provider.id),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: layout.rowMeta,
								children: [
									provider.baseURL,
									" · ",
									provider.model
								]
							}),
							editingId === provider.id && editing !== void 0 && renderEditor(editing, (next) => patch(editing.id, next))
						]
					}, provider.id)),
					addDraft !== null && renderEditor(addDraft, (next) => setAddDraft((current) => ({
						...current,
						...next
					}))),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: layout.footer,
						children: [addDraft === null && editingId === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}),
							onClick: () => setAddDraft({
								id: newProviderId(),
								name: "",
								baseURL: "",
								model: "",
								enabled: true
							}),
							children: t("settings.provider.add")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: saving,
							onClick: () => void save(),
							children: t("settings.save")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							disabled: saving,
							onClick: () => closeEditor(),
							children: t("settings.cancel")
						})] }), notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: notice.kind === "saved" ? layout.saved : layout.error,
							children: notice.text
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/VisionSettings.tsx
		/**
		* ModelSettings — the looklook "模型配置" section inside the plugin card:
		* - 视觉模型: recognizes images AND video frames (video = frames → image).
		*   Primary + fallbacks with automatic failover.
		* - 音频模型: transcript + sound understanding in one config; the plugin
		*   probes the model's capability at use time (no user label needed).
		*   Plus a one-click local ASR install (faster-whisper medium).
		*
		* Both lists reuse {@link ProviderListEditor}; the local ASR install card is
		* wired to the authorized remote.looklook RPCs (asrStatus / asrInstall).
		*/
		const css$2 = {
			stack: {
				display: "flex",
				flexDirection: "column",
				gap: 28,
				color: "var(--dsw-alias-label-primary)"
			},
			divider: {
				border: "none",
				borderTop: "1px solid var(--dsw-alias-border-l2)"
			},
			asrCard: {
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 12,
				padding: "12px 14px",
				display: "flex",
				alignItems: "center",
				gap: 12
			},
			asrText: {
				display: "flex",
				flexDirection: "column",
				gap: 3,
				minWidth: 0,
				flex: 1
			},
			asrTitle: {
				fontSize: 13,
				lineHeight: "20px",
				fontWeight: 600
			},
			asrDesc: {
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			asrBadge: {
				flex: "none",
				padding: "2px 10px",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 999,
				fontSize: 12,
				lineHeight: "18px"
			},
			asrCardCol: {
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 12,
				padding: "12px 14px",
				display: "flex",
				flexDirection: "column",
				gap: 10,
				color: "var(--dsw-alias-label-primary)"
			},
			asrHead: {
				display: "flex",
				alignItems: "flex-start",
				gap: 12
			},
			asrModels: {
				display: "flex",
				flexDirection: "column",
				gap: 2
			},
			asrModelRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "3px 4px",
				borderRadius: 6,
				cursor: "pointer"
			},
			asrModelName: {
				fontSize: 12,
				lineHeight: "18px",
				fontWeight: 500
			},
			asrModelSize: {
				fontSize: 11,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			asrCurrentTag: {
				flex: "none",
				padding: "0 8px",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 999,
				fontSize: 10,
				lineHeight: "16px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			asrActions: {
				display: "flex",
				justifyContent: "flex-end"
			}
		};
		/** One-click local ASR install card (all calls ride the authorized RPC).
		*  Model is selectable; the host keeps only ONE model on disk (installing a
		*  different size purges the previous one), so the card also offers "换装". */
		function LocalAsrCard({ asrStatus, asrInstall, t }) {
			const [status, setStatus] = (0, react.useState)(null);
			const [selectedModel, setSelectedModel] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const refresh = async () => {
				try {
					const body = await asrStatus();
					setStatus(body);
					setError(null);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [asrStatus]);
			(0, react.useEffect)(() => {
				if (selectedModel !== "" || status === null) return;
				const initial = status.model !== "" ? status.model : status.options.find((o) => o.id === "small")?.id ?? status.options[0]?.id ?? "";
				if (initial !== "") setSelectedModel(initial);
			}, [status, selectedModel]);
			const pollTimerRef = (0, react.useRef)(null);
			const install = async (model) => {
				if (model === "") return;
				setBusy(true);
				setError(null);
				try {
					const body = await asrInstall(model);
					if (!body.ok) throw new Error(body.error ?? "启动安装失败");
					if (body.already) {
						await refresh();
						return;
					}
					await new Promise((resolveBody) => {
						let settled = false;
						const finish = () => {
							if (settled) return;
							settled = true;
							if (pollTimerRef.current !== null) {
								window.clearInterval(pollTimerRef.current);
								pollTimerRef.current = null;
							}
							resolveBody();
						};
						pollTimerRef.current = window.setInterval(async () => {
							let current = null;
							try {
								current = await asrStatus();
								setStatus(current);
								setError(null);
							} catch (err) {
								setError(err instanceof Error ? err.message : String(err));
							}
							if (current !== null && (current.phase === "done" || current.phase === "failed")) finish();
						}, 1500);
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			};
			(0, react.useEffect)(() => () => {
				if (pollTimerRef.current !== null) {
					window.clearInterval(pollTimerRef.current);
					pollTimerRef.current = null;
				}
			}, []);
			const phaseLabel = (phase) => {
				const size = status?.options.find((o) => o.id === selectedModel)?.sizeLabel;
				switch (phase) {
					case "checking": return "环境检查中…";
					case "installing-deps": return "安装依赖中…";
					case "downloading-model": return `下载模型中…（${size ?? "视网速而定"}）`;
					case "writing": return "写入本地服务…";
					case "done": return "已就绪";
					case "failed": return "安装失败";
					default: return "未安装";
				}
			};
			const installed = status?.installed === true || status?.phase === "done";
			const installedOption = status?.options.find((o) => o.id === (status?.model ?? ""));
			const canSwitch = installed && selectedModel !== "" && selectedModel !== status?.model;
			const options = status?.options ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: css$2.asrCardCol,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: css$2.asrHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: css$2.asrText,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$2.asrTitle,
									children: t("asr.local.title")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$2.asrDesc,
									children: status === null ? t("asr.local.checking") : installed ? `${t("asr.local.ready")}${installedOption ? ` · ${installedOption.name}（${installedOption.sizeLabel}）` : ""}` : phaseLabel(status.phase)
								}),
								error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$2.asrDesc,
									children: error
								}),
								status?.error !== void 0 && status.error !== null && status.error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: css$2.asrDesc,
									children: status.error
								})
							]
						}), installed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: css$2.asrBadge,
							children: t("asr.local.readyBadge")
						})]
					}),
					options.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: css$2.asrModels,
						children: options.map((opt) => {
							const isCurrent = installed && opt.id === status?.model;
							const isSel = opt.id === selectedModel;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: css$2.asrModelRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: "looklook-asr-model",
										checked: isSel,
										disabled: busy,
										onChange: () => setSelectedModel(opt.id)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: css$2.asrModelName,
										children: opt.name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: css$2.asrModelSize,
										children: opt.sizeLabel
									}),
									isCurrent && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: css$2.asrCurrentTag,
										children: "当前"
									})
								]
							}, opt.id);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: css$2.asrActions,
						children: !installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							disabled: busy || selectedModel === "",
							onClick: () => void install(selectedModel),
							children: busy ? "…" : t("asr.local.install")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							disabled: busy || !canSwitch,
							onClick: () => {
								if (canSwitch) install(selectedModel);
							},
							children: busy ? "…" : canSwitch ? "换装模型" : t("asr.local.readyBadge")
						})
					})
				]
			});
		}
		/** The model-configuration body (visual + audio sections). */
		function ModelSettingsSection(props) {
			const { api, t, listModels, testVision, testAudio, asrStatus, asrInstall } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: css$2.stack,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderListEditor, {
						api,
						pluginSettings: props.pluginSettings,
						t,
						ns: "vision",
						title: t("settings.vision.title"),
						intro: t("settings.vision.intro"),
						listModels,
						testModel: testVision,
						testLabel: "测试看图能力"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: css$2.divider }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderListEditor, {
						api,
						pluginSettings: props.pluginSettings,
						t,
						ns: "looklook-audio",
						title: t("settings.audio.title"),
						intro: t("settings.audio.intro"),
						listModels,
						testModel: testAudio,
						testLabel: "测试音频能力"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocalAsrCard, {
						asrStatus,
						asrInstall,
						t
					})
				]
			});
		}
		//#endregion
		//#region src/client/EnvCheck.tsx
		/**
		* EnvCheckDialog — the "环境检测" modal opened from the looklook plugin card.
		* Runs the host environment self-check (Python / ffmpeg / yt-dlp / local ASR)
		* and lists every item with status. Repairable items show a "一键修复" button
		* that calls the host repair RPC and refreshes that item's state.
		*/
		const css$1 = {
			overlay: {
				position: "fixed",
				inset: 0,
				zIndex: 1e3,
				background: "rgba(0,0,0,0.45)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24
			},
			dialog: {
				boxSizing: "border-box",
				width: "min(560px, 100%)",
				maxHeight: "80vh",
				overflow: "auto",
				background: "var(--dsw-alias-bg-layer-2)",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 14,
				padding: "18px 20px",
				display: "flex",
				flexDirection: "column",
				gap: 14
			},
			header: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 12
			},
			title: {
				margin: 0,
				fontSize: 16,
				lineHeight: "24px",
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary)"
			},
			summary: {
				margin: 0,
				fontSize: 13,
				lineHeight: "20px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			item: {
				display: "flex",
				alignItems: "flex-start",
				gap: 10,
				padding: "10px 12px",
				border: "1px solid var(--dsw-alias-border-l1)",
				borderRadius: 10,
				background: "var(--dsw-alias-bg-layer-1)"
			},
			itemHead: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				minWidth: 0
			},
			dot: {
				width: 8,
				height: 8,
				borderRadius: 999,
				flex: "none",
				marginTop: 6
			},
			itemLabel: {
				fontSize: 13,
				lineHeight: "20px",
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)"
			},
			itemDetail: {
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)",
				marginTop: 2,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			},
			guidance: {
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-secondary)",
				marginTop: 6,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			},
			itemBody: {
				flex: 1,
				minWidth: 0
			},
			actions: {
				display: "flex",
				justifyContent: "flex-end",
				gap: 8,
				marginTop: 4
			},
			footer: {
				display: "flex",
				justifyContent: "flex-end",
				gap: 8,
				borderTop: "1px solid var(--dsw-alias-border-l1)",
				paddingTop: 12
			}
		};
		function statusColor(status) {
			if (status === "ok") return "var(--dsw-alias-state-success-primary)";
			if (status === "error") return "var(--dsw-alias-state-error-primary)";
			return "var(--dsw-alias-state-warn-primary)";
		}
		function statusText(status) {
			if (status === "ok") return "正常";
			if (status === "error") return "异常";
			return "缺失";
		}
		/** One check row with its repair button. */
		function CheckItemRow({ item, repairing, onRepair }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: css$1.item,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
					...css$1.dot,
					background: statusColor(item.status)
				} }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: css$1.itemBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: css$1.itemHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: css$1.itemLabel,
								children: item.label
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 12,
									lineHeight: "18px",
									color: statusColor(item.status)
								},
								children: statusText(item.status)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: css$1.itemDetail,
							children: item.detail
						}),
						item.guidance !== void 0 && item.guidance !== "" && item.status !== "ok" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: css$1.guidance,
							children: item.guidance
						}),
						item.repairable && item.status !== "ok" && item.repairAction !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: css$1.actions,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								disabled: repairing,
								onClick: () => onRepair(item),
								children: repairing ? "修复中…" : "一键修复"
							})
						})
					]
				})]
			});
		}
		/** The environment-check modal. */
		function EnvCheckDialog(props) {
			const { t, envCheck, envRepair, onClose } = props;
			const [report, setReport] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [repairing, setRepairing] = (0, react.useState)(null);
			const refresh = async () => {
				setError(null);
				try {
					setReport(await envCheck());
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [envCheck]);
			const repair = async (item) => {
				if (item.repairAction === void 0) return;
				setRepairing(item.id);
				try {
					const fresh = await envRepair(item.repairAction);
					setReport((current) => current === null ? null : {
						...current,
						items: current.items.map((i) => i.id === fresh.id ? fresh : i)
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setRepairing(null);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: css$1.overlay,
				onClick: (e) => {
					if (e.target === e.currentTarget) onClose();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: css$1.dialog,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": t("env.dialogTitle"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: css$1.header,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								style: css$1.title,
								children: t("env.dialogTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								size: "sm",
								onClick: onClose,
								children: t("env.close")
							})]
						}),
						report !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: css$1.summary,
							children: report.summary
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								margin: 0,
								fontSize: 13,
								color: "var(--dsw-alias-state-error-primary)"
							},
							children: error
						}),
						report !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: report.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckItemRow, {
								item,
								repairing: repairing === item.id,
								onRepair: repair
							}, item.id))
						}),
						report === null && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								margin: 0,
								fontSize: 13,
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: t("env.checking")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: css$1.footer,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => void refresh(),
								children: t("env.refresh")
							})
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/PluginTab.tsx
		/**
		* LooklookPluginCard: the looklook configuration card inside the Plugins
		* settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
		* collapsible card chrome as the agent-loop / bash / web-search cards:
		* a header (title + description + chevron) that discloses:
		* - the feature switches (识别图像 / 识别视频);
		* - the model configuration (视觉模型 + 音频模型 + 本地 ASR 一键安装),
		*   visible while 识别图像 is ON.
		*/
		const css = {
			card: {
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-3)",
				borderRadius: 10,
				minWidth: 0,
				overflow: "hidden",
				listStyle: "none"
			},
			header: {
				boxSizing: "border-box",
				width: "100%",
				minHeight: 52,
				color: "inherit",
				font: "inherit",
				textAlign: "left",
				cursor: "pointer",
				background: "transparent",
				border: "none",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 12,
				padding: "12px 14px"
			},
			headText: {
				display: "flex",
				flexDirection: "column",
				gap: 2,
				minWidth: 0
			},
			name: {
				fontSize: 14,
				lineHeight: "20px",
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary)"
			},
			desc: {
				fontSize: 12,
				lineHeight: "17px",
				color: "var(--dsw-alias-label-tertiary)"
			},
			chevron: {
				color: "var(--dsw-alias-label-tertiary)",
				flex: "none"
			},
			body: {
				borderTop: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-module-platform)",
				padding: "14px 14px 16px",
				display: "flex",
				flexDirection: "column",
				gap: 24
			}
		};
		/** The plugin-configuration card body. */
		function LooklookPluginCard(props) {
			const { api, pluginSettings, t, features, useFeatures, listModels, testVision, testAudio, asrStatus, asrInstall, envCheck, envRepair, usePluginEnabled } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [envOpen, setEnvOpen] = (0, react.useState)(false);
			const pluginEnabled = usePluginEnabled();
			const featuresProps = {
				api,
				t,
				features,
				useFeatures
			};
			const modelProps = {
				api,
				pluginSettings,
				t,
				listModels,
				testVision,
				testAudio,
				asrStatus,
				asrInstall
			};
			const envProps = {
				t,
				envCheck,
				envRepair
			};
			const title = t("card.title");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: css.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						style: css.header,
						"aria-expanded": open,
						"aria-label": `${t(open ? "card.collapse" : "card.expand")}: ${title}`,
						onClick: () => setOpen(!open),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: css.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: css.name,
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: css.desc,
								children: t("card.desc")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...css.chevron,
								display: "inline-flex",
								transform: open ? "rotate(180deg)" : "none",
								transition: "transform .14s ease-in-out"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
						})]
					}),
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: css.body,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LooklookFeaturesSection, { ...featuresProps }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									justifyContent: "flex-start",
									marginTop: 2
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "sm",
									onClick: () => setEnvOpen(true),
									children: t("env.checkButton")
								})
							}),
							pluginEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
								border: "none",
								borderTop: "1px solid var(--dsw-alias-border-l2)"
							} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelSettingsSection, { ...modelProps })] })
						]
					}),
					envOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnvCheckDialog, {
						...envProps,
						onClose: () => setEnvOpen(false)
					})
				]
			});
		}
		//#endregion
		//#region src/client/VisionToggle.tsx
		/** Decide the visual state from one store snapshot. */
		function eyeVisualState(status, eye, unconfigured) {
			if (status !== "ready") return eye === "off" ? "off" : "on";
			if (eye === "off") return "off";
			return unconfigured ? "unconfigured" : "on";
		}
		/** One eye glyph (inline SVG; the primitives set has no eye icon). */
		function EyeGlyph({ off, warning }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M12 5c-5 0-9 3.5-11 7 2 3.5 6 7 11 7s9-3.5 11-7c-2-3.5-6-7-11-7z",
						stroke: "currentColor",
						strokeWidth: "1.8",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "3",
						fill: warning ? "currentColor" : "none",
						stroke: "currentColor",
						strokeWidth: "1.8"
					}),
					off && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
						x1: "4",
						y1: "4",
						x2: "20",
						y2: "20",
						stroke: "currentColor",
						strokeWidth: "1.8",
						strokeLinecap: "round"
					})
				]
			});
		}
		/** Render the eye toggle button. */
		function VisionToggle(props) {
			const { controller, useSnapshot, usePluginEnabled, t } = props;
			const pluginEnabled = usePluginEnabled();
			const state = useSnapshot((s) => s);
			if (!pluginEnabled) return null;
			const eye = state.status === "ready" ? state.eye : "on";
			const unconfigured = state.status === "ready" && state.unconfigured === true;
			const visual = eyeVisualState(state.status, eye, unconfigured);
			const label = visual === "unconfigured" ? t("eye.unconfigured") : visual === "on" ? t("eye.on") : t("eye.off");
			const active = visual !== "off";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				title: label,
				"aria-label": label,
				"aria-pressed": active,
				"data-looklook-eye": visual,
				onClick: () => controller.toggle(eye === "on" ? "off" : "on"),
				style: {
					display: "grid",
					placeItems: "center",
					flex: "none",
					width: 28,
					height: 28,
					border: "none",
					borderRadius: 999,
					background: "transparent",
					cursor: "pointer",
					color: active ? visual === "unconfigured" ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-label-tertiary)"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EyeGlyph, {
					off: visual === "off",
					warning: visual === "unconfigured"
				})
			});
		}
		//#endregion
		//#region src/client/FileChips.tsx
		/** One chip card (hover reveals the remove ×). */
		function FileChips(props) {
			const { t, pending, usePending, sessionId } = props;
			const list = usePending((state) => state[sessionId]) ?? [];
			const previewUrls = (0, react.useRef)(/* @__PURE__ */ new Set());
			(0, react.useEffect)(() => {
				const current = new Set(list.map((file) => file.previewUrl).filter((url) => url !== void 0));
				for (const url of previewUrls.current) if (!current.has(url)) URL.revokeObjectURL(url);
				previewUrls.current = current;
			}, [list]);
			(0, react.useEffect)(() => () => {
				for (const url of previewUrls.current) URL.revokeObjectURL(url);
			}, []);
			if (list.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `@keyframes looklook-spin { to { transform: rotate(360deg); } }` }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					boxSizing: "border-box",
					width: "calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset))",
					maxWidth: "calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset))",
					margin: "0 auto calc(0px - var(--dsh-composer-stack-gap) - 3px)",
					padding: "0 var(--dsh-composer-dock-inset)",
					flex: "none"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						alignItems: "center",
						gap: 8,
						padding: "6px 10px",
						borderRadius: "12px 12px 0 0",
						background: "var(--dsw-specific-tip)",
						border: "1px solid var(--dsw-alias-border-l1)",
						borderBottom: "none"
					},
					children: [list.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							maxWidth: 260,
							padding: "3px 8px 3px 6px",
							border: `1px solid ${file.error !== void 0 ? "var(--dsw-alias-state-warn-border, var(--dsw-alias-border-l2))" : "var(--dsw-alias-border-l2)"}`,
							borderRadius: 8,
							background: "var(--dsw-alias-bg-layer-2)",
							fontSize: 12,
							lineHeight: "18px",
							color: "var(--dsw-alias-label-primary)"
						},
						children: [file.uploading === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								minWidth: 0
							},
							children: [
								file.previewUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									src: file.previewUrl,
									alt: "",
									style: {
										width: 30,
										height: 30,
										objectFit: "cover",
										borderRadius: 5,
										flex: "none"
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 14,
									height: 14,
									borderRadius: "50%",
									flex: "none",
									border: "2px solid var(--dsw-alias-border-l3)",
									borderTopColor: "var(--dsw-alias-brand-primary)",
									animation: "looklook-spin 0.8s linear infinite"
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										flexDirection: "column",
										minWidth: 0
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											children: file.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: { color: "var(--dsw-alias-label-tertiary)" },
											children: [
												"上传中 ",
												file.progress ?? 0,
												"%"
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												width: 120,
												height: 3,
												borderRadius: 2,
												background: "var(--dsw-alias-border-l2)",
												overflow: "hidden",
												marginTop: 2
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
												display: "block",
												height: "100%",
												width: `${file.progress ?? 0}%`,
												background: "var(--dsw-alias-brand-primary)",
												transition: "width 0.2s ease"
											} })
										})
									]
								})
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [file.previewUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							src: file.previewUrl,
							alt: "",
							style: {
								width: 30,
								height: 30,
								objectFit: "cover",
								borderRadius: 5,
								flex: "none"
							}
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								display: "grid",
								placeItems: "center",
								flex: "none",
								color: "var(--dsw-alias-brand-primary)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileTypeIcon, {
								name: file.name,
								size: 20
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								flexDirection: "column",
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: [
									file.name,
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: "var(--dsw-alias-label-tertiary)" },
										children: formatSize(file.size)
									})
								]
							}), file.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: "var(--dsw-alias-state-warn-label)",
									fontSize: 11
								},
								children: file.error
							})]
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": `${t("upload.remove")}: ${file.name}`,
							onClick: () => pending.remove(sessionId, file.id),
							style: {
								flex: "none",
								display: "grid",
								placeItems: "center",
								width: 16,
								height: 16,
								border: "none",
								borderRadius: 999,
								background: "transparent",
								cursor: "pointer",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								width: "10",
								height: "10",
								viewBox: "0 0 24 24",
								fill: "none",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: "M6 6l12 12M18 6L6 18",
									stroke: "currentColor",
									strokeWidth: "2.4",
									strokeLinecap: "round"
								})
							})
						})]
					}, file.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							marginLeft: "auto",
							fontSize: 12,
							lineHeight: "18px",
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: t("upload.enterToSend")
					})]
				})
			})] });
		}
		//#endregion
		//#region src/client/upload-shared.ts
		/**
		* Shared upload logic for dsh-looklook: upload any dropped file (image,
		* archive, video) through the plugin's `remote.looklook.upload` RPC (saved
		* into the session workspace `.uploads/`) and return its path. The caller
		* stages the note into the input draft — nothing is sent until the user
		* presses Enter.
		*
		* The channel accepts EVERY extension; the client asks the host about the
		* session model's modality first and routes images to the native pipeline
		* when the model can already see them (multi-modal models stay native).
		*/
		/** Image extensions that ride the native DSH pipeline when the model is
		* multi-modal (they are intercepted only for text-only sessions). */
		const NATIVE_IMAGE_EXTENSIONS = [
			".png",
			".jpg",
			".jpeg",
			".gif",
			".webp",
			".bmp",
			".svg",
			".avif"
		];
		/** Whether a file name is an image that can ride the native pipeline. */
		function isNativeImageName(name) {
			const ext = extensionOf(name);
			return NATIVE_IMAGE_EXTENSIONS.includes(ext);
		}
		/** Whether a file name should be intercepted by the looklook upload channel
		* (i.e. it is NOT a native image; images are routed by modality at drop time). */
		function isUploadableName(name) {
			return !isNativeImageName(name);
		}
		function extensionOf(name) {
			const lower = name.toLowerCase();
			const dot = lower.lastIndexOf(".");
			return dot >= 0 ? lower.slice(dot) : "";
		}
		/**
		* Convert a File to a base64 data string asynchronously via FileReader, so a
		* large file never blocks the UI thread with a synchronous btoa loop.
		*/
		function fileToBase64(file) {
			return new Promise((resolveBody, rejectBody) => {
				const reader = new FileReader();
				reader.onload = () => {
					const result = reader.result;
					if (typeof result !== "string") {
						rejectBody(/* @__PURE__ */ new Error("读取文件失败"));
						return;
					}
					const comma = result.indexOf(",");
					resolveBody(comma >= 0 ? result.slice(comma + 1) : result);
				};
				reader.onerror = () => rejectBody(/* @__PURE__ */ new Error("读取文件失败"));
				reader.readAsDataURL(file);
			});
		}
		/** Upload one file via the authorized RPC. */
		async function uploadFile(remote, sessionId, file, onProgress) {
			if (remote?.upload === void 0) throw new Error("上传服务未就绪（插件宿主未加载）");
			const data = await fileToBase64(file);
			onProgress?.(30);
			const envelope = await remote.upload({
				sessionId,
				name: file.name,
				data
			});
			onProgress?.(100);
			if (!envelope.ok) throw new Error(typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "上传失败");
			const business = envelope.value;
			if (business?.ok === true && business.path !== void 0) return {
				path: business.path,
				name: business.name ?? file.name
			};
			throw new Error(typeof business?.error === "string" ? business.error : "上传失败");
		}
		//#endregion
		//#region src/client/locales.ts
		/** dsh-looklook client copy. Product copy is Chinese; English mirrors it. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"settings.nav": "视觉模型",
			"settings.intro": "配置用于识别图片的视觉模型。支持多个提供商：第一个为主模型，其余为备用；主模型不可用时自动降级到备用模型。",
			"settings.vision.title": "视觉模型",
			"settings.vision.intro": "识别图像与视频画面（视频识别即抽帧成图，共用此模型）。支持配置主模型与备用模型，主模型报错时自动切换备用。",
			"settings.audio.title": "音频模型",
			"settings.audio.intro": "理解视频的声音：对白转写 + 语气/音乐/节奏。插件会自动探测模型能力——支持音频输入的模型一次返回全部（对白+语气+音乐），仅转写的模型返回对白文字。也可使用下方本地一键安装。",
			"settings.provider.add": "添加提供商",
			"settings.provider.name": "名称",
			"settings.provider.nameHint": "显示名称，如「GLM-4V」",
			"settings.provider.baseURL": "API 地址",
			"settings.provider.baseURLHint": "OpenAI 兼容端点，如 https://api.example.com/v1",
			"settings.provider.model": "模型",
			"settings.provider.modelHint": "模型 ID，如 glm-4v-plus",
			"settings.provider.fetchModels": "获取模型",
			"settings.provider.modelsFetched": "已获取模型列表，点击上方输入框选择",
			"settings.provider.baseURLRequired": "请先填写 API 地址",
			"settings.provider.apiKey": "API Key",
			"settings.provider.apiKeyUnset": "未配置",
			"settings.provider.apiKeyConfigured": "已配置（留空则保持不变）",
			"settings.provider.enabled": "启用",
			"settings.provider.primary": "主视觉模型",
			"settings.provider.fallback": "备用视觉模型",
			"settings.provider.moveUp": "上移",
			"settings.provider.moveDown": "下移",
			"settings.provider.remove": "删除",
			"settings.provider.empty": "尚未配置视觉模型提供商。",
			"settings.save": "保存",
			"settings.cancel": "取消",
			"settings.saved": "已保存",
			"settings.saveFailed": "保存失败",
			"settings.failoverHint": "顺序即降级顺序：第一个启用的提供商为主模型，主模型失败时依次使用后续提供商。",
			"eye.on": "Look Look 已开启：当前会话将使用视觉增强",
			"eye.off": "Look Look 已关闭：当前会话保留原始处理方式",
			"eye.unconfigured": "视觉增强已开启，但未配置视觉模型 → 点击前往设置",
			"card.title": "Look Look",
			"card.desc": "可以帮你看图片、视频、zip、psd、ppt",
			"card.expand": "展开",
			"card.collapse": "收起",
			"features.switches.heading": "功能开关",
			"features.master.label": "开启看看",
			"features.master.desc": "这是插件级总开关：关闭后 DSH 暂时恢复原样，插件不会被卸载；需要时重新打开即可。对话框里的小眼睛还可以按会话快速切换，方便体验和比较 Look Look 的识别效果。",
			"features.supported.heading": "支持的文件格式",
			"features.platforms.heading": "支持视频平台",
			"features.image.label": "识别图像",
			"features.image.desc": "开启后用插件视觉模型识别图片；关闭则交给大模型自身多模态能力（如大模型支持看图）。",
			"features.video.label": "识别视频",
			"features.video.desc": "开启后支持视频分析（抽帧识别）；关闭则视频仅保存不分析（适合大模型本身能看视频的情况）。",
			"features.uploadHint": "文件上传无需开关：装上插件即支持拖拽上传任意文件。",
			"asr.local.title": "本地语音识别（ASR）",
			"asr.local.desc": "在本地安装 faster-whisper，无需 API 即可转写视频对白。可选 tiny/base/small/medium/large-v3，同时只保留一个模型。",
			"asr.local.install": "一键安装",
			"asr.local.checking": "检查安装状态…",
			"asr.local.ready": "已安装：视频对白将在本地转写（无需 API）。",
			"asr.local.readyBadge": "已就绪",
			"upload.remove": "移除附件",
			"upload.enterToSend": "按发送键一并发送",
			"upload.message": "上传了文件 {name} → {path}",
			"env.checkButton": "环境检测",
			"env.dialogTitle": "环境检测",
			"env.checking": "检测中…",
			"env.close": "关闭",
			"env.refresh": "重新检测"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"settings.nav": "Vision Models",
			"settings.intro": "Configure the vision model that describes images. Multiple providers are supported: the first is primary, the rest are fallbacks; when the primary fails, recognition degrades to the next provider automatically.",
			"settings.provider.add": "Add provider",
			"settings.provider.name": "Name",
			"settings.provider.nameHint": "Display name, e.g. \"GLM-4V\"",
			"settings.provider.baseURL": "API URL",
			"settings.provider.baseURLHint": "OpenAI-compatible endpoint, e.g. https://api.example.com/v1",
			"settings.provider.model": "Model",
			"settings.provider.modelHint": "Model id, e.g. glm-4v-plus",
			"settings.provider.fetchModels": "Fetch models",
			"settings.provider.modelsFetched": "Models fetched — click the input above to pick",
			"settings.provider.baseURLRequired": "Fill in the API URL first",
			"settings.provider.apiKey": "API Key",
			"settings.provider.apiKeyUnset": "Not configured",
			"settings.provider.apiKeyConfigured": "Configured (leave empty to keep)",
			"settings.provider.enabled": "Enabled",
			"settings.provider.primary": "Primary vision model",
			"settings.provider.fallback": "Fallback vision model",
			"settings.provider.moveUp": "Move up",
			"settings.provider.moveDown": "Move down",
			"settings.provider.remove": "Remove",
			"settings.provider.empty": "No vision provider configured yet.",
			"settings.vision.title": "Vision model",
			"settings.vision.intro": "Recognizes images and video frames (video recognition extracts frames and reuses this model). Configure a primary plus fallbacks; the plugin switches automatically when the primary errors.",
			"settings.audio.title": "Audio model",
			"settings.audio.intro": "Understands video sound: transcript + tone/music/pace. The plugin probes the model's capability automatically — audio-capable models return everything in one call (transcript + tone + music), transcript-only models return the transcript. A one-click local install is available below.",
			"settings.save": "Save",
			"settings.cancel": "Cancel",
			"settings.saved": "Saved",
			"settings.saveFailed": "Save failed",
			"settings.failoverHint": "Order is failover order: the first enabled provider is primary; when it fails, recognition degrades through the rest in order.",
			"eye.on": "Vision assist is on: images are described by the vision model before they reach the conversation model",
			"eye.off": "Vision assist is off: images are sent to the conversation model as-is",
			"eye.unconfigured": "Vision assist is on but no vision model is configured — click to open settings",
			"card.title": "Look Look",
			"card.desc": "Can help you view images, videos, ZIP, PSD, and PPT files",
			"card.expand": "Expand",
			"card.collapse": "Collapse",
			"features.switches.heading": "Feature switches",
			"features.master.label": "Enable LookLook",
			"features.master.desc": "Plugin master switch: OFF temporarily restores the normal DSH behavior without uninstalling the plugin. The conversation eye can still switch Look Look per session for quick comparison.",
			"features.supported.heading": "Supported formats",
			"features.platforms.heading": "Video platforms",
			"features.image.label": "Image recognition",
			"features.image.desc": "When ON, the plugin vision model recognizes images; when OFF the main model's own multimodal capability is used (if it supports images).",
			"features.video.label": "Video recognition",
			"features.video.desc": "When ON, videos are analyzed (frame extraction); when OFF videos are saved but never analyzed (for models that natively understand video).",
			"features.uploadHint": "No upload switch needed: installing the plugin enables drag-and-drop upload of any file.",
			"asr.local.title": "Local speech recognition (ASR)",
			"asr.local.desc": "Installs faster-whisper locally so video transcripts need no API. Pick tiny/base/small/medium/large-v3; only one model is kept on disk at a time.",
			"asr.local.install": "Install",
			"asr.local.checking": "Checking install state…",
			"asr.local.ready": "Installed: video transcripts are transcribed locally (no API needed).",
			"asr.local.readyBadge": "Ready",
			"upload.remove": "Remove attachment",
			"upload.enterToSend": "Sends with the message",
			"upload.message": "Uploaded file {name} → {path}",
			"env.checkButton": "Environment Check",
			"env.dialogTitle": "Environment Check",
			"env.checking": "Checking…",
			"env.close": "Close",
			"env.refresh": "Re-check"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "looklook";
		/** Slot entry ids. */
		const PLUGIN_CARD_ID = "looklook";
		const TOGGLE_ID = "looklook-eye";
		const PENDING_ID = "looklook-pending";
		/** Required services: slots, locale, connection, remote, sessions, conversation. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"sessions",
			"conversation"
		];
		/**
		* Client plugin body: register the looklook Plugins-settings tab, the
		* composer upload control, drag-and-drop of archive/video files, the eye
		* toggle, and the original-image message view.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-looklook: dictionaries");
			const t = ctx.locale.bind(NS);
			const connection = ctx.get("connection");
			const sessions = ctx.get("sessions");
			if (typeof window !== "undefined") ctx.effect(() => {
				const win = window;
				win.__dshShareSession = (sessionId, title) => {
					const ref = "dsh-session://" + sessionId;
					const text = title ? `dsh-session://${sessionId}\n标题: ${title}` : ref;
					navigator.clipboard?.writeText?.(text).catch(() => {
						const ta = document.createElement("textarea");
						ta.value = text;
						ta.style.cssText = "position:fixed;left:-9999px";
						document.body.appendChild(ta);
						ta.select();
						try {
							document.execCommand("copy");
						} catch {}
						document.body.removeChild(ta);
					});
					const el = document.createElement("div");
					el.textContent = "✅ 已复制会话引用（dsh-session://），可粘贴到其他对话";
					el.style.cssText = [
						"position:fixed",
						"bottom:24px",
						"left:50%",
						"transform:translateX(-50%)",
						"z-index:99999",
						"background:var(--dsw-alias-bg-base,#1a1a2e)",
						"color:var(--dsw-alias-label-primary,#e0e0e0)",
						"border:1px solid var(--dsw-alias-border-l2,#333)",
						"border-radius:10px",
						"padding:10px 20px",
						"font-size:14px",
						"box-shadow:0 4px 16px rgba(0,0,0,0.3)",
						"max-width:80vw",
						"text-align:center",
						"word-break:break-all",
						"transition:opacity .25s"
					].join(";");
					document.body.appendChild(el);
					setTimeout(() => {
						el.style.opacity = "0";
					}, 2200);
					setTimeout(() => {
						document.body.removeChild(el);
					}, 2700);
				};
				return () => {
					delete win.__dshShareSession;
				};
			}, "dsh-looklook: session share global");
			const pending = createPendingFilesController();
			const usePending = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(pending.store);
			/** Compose the model-facing + client-rendering notes for one staged file. */
			const fileTypeLabel = (name) => {
				const ext = name.toLowerCase().split(".").pop() ?? "";
				if ([
					"png",
					"jpg",
					"jpeg",
					"gif",
					"webp",
					"bmp",
					"avif"
				].includes(ext)) return "图片";
				if ([
					"mp4",
					"mov",
					"avi",
					"mkv",
					"webm",
					"flv",
					"wmv",
					"m4v"
				].includes(ext)) return "视频";
				if ([
					"zip",
					"7z",
					"rar",
					"tar",
					"gz"
				].includes(ext)) return "压缩包";
				if ([
					"pdf",
					"doc",
					"docx",
					"xls",
					"xlsx",
					"ppt",
					"pptx",
					"psd",
					"txt"
				].includes(ext)) return "文档";
				return "文件";
			};
			const fileNote = (f) => {
				return `[${fileTypeLabel(f.name)}]${f.name} 排队中...`;
			};
			/**
			* Merge every staged file's note into the current draft. Returns the
			* merged draft text; the caller decides when to submit.
			*/
			const mergeNotesIntoDraft = (sessionId, draft) => {
				const staged = pending.get(sessionId).filter((f) => f.path !== void 0 && f.path !== "" && f.uploading !== true && f.error === void 0);
				if (staged.length === 0) return draft;
				const notes = staged.map(fileNote).join("\n");
				const remaining = pending.get(sessionId).filter((f) => f.path === void 0 || f.path === "" || f.uploading === true || f.error !== void 0);
				const state = { ...pending.store.getSnapshot() };
				if (remaining.length > 0) state[sessionId] = remaining;
				else delete state[sessionId];
				pending.store.set(state);
				return draft === "" ? notes : `${draft}\n${notes}`;
			};
			/**
			* Enter/send submit patch (per-session): every submit route — Enter via the
			* keyboard, the send button via actions.submit — funnels through the
			* session input shell's `submit()`. Wrap it once so staged files ride the
			* outgoing message instead of needing a separate "send attachment" button.
			*/
			const patchedSessions = /* @__PURE__ */ new Set();
			const ensureSubmitPatched = (sessionId) => {
				if (patchedSessions.has(sessionId)) return;
				const actx = sessions.scope ? sessions.scope(sessionId) : void 0;
				if (actx === void 0) return;
				const shell = (actx.get?.("conversation"))?.input?.for?.(actx);
				if (shell?.submit === void 0 || shell?.setDraft === void 0 || shell?.state === void 0) return;
				const raw = shell;
				if (raw.__looklookWrapped === true) {
					patchedSessions.add(sessionId);
					return;
				}
				raw.__looklookWrapped = true;
				const originalSubmit = shell.submit.bind(shell);
				const setDraft = shell.setDraft.bind(shell);
				const readDraft = () => shell.state?.getSnapshot()?.draft ?? "";
				shell.submit = (mode) => {
					try {
						const draft = readDraft();
						const merged = mergeNotesIntoDraft(sessionId, draft);
						if (merged !== draft) setDraft(merged);
					} catch (error) {
						console.error("looklook submit merge failed:", error);
					}
					originalSubmit(mode);
				};
				patchedSessions.add(sessionId);
			};
			ctx.effect(() => {
				const sync = () => {
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId !== void 0 && sessionId !== "") ensureSubmitPatched(sessionId);
				};
				const dispose = sessions.currentProvideInfo.subscribe(sync);
				sync();
				return () => {
					dispose();
				};
			}, "dsh-looklook: submit merge patch");
			const pluginSettingsListeners = /* @__PURE__ */ new Set();
			const pluginSettings = {
				subscribe: (listener) => {
					pluginSettingsListeners.add(listener);
					return () => {
						pluginSettingsListeners.delete(listener);
					};
				},
				describe: async () => {
					const remote = ctx.get("remote.looklook");
					if (remote?.describeSettings === void 0) return {
						ok: false,
						error: "插件设置服务未就绪"
					};
					const envelope = await remote.describeSettings();
					const body = envelope.value;
					if (!envelope.ok || body?.ok !== true) return {
						ok: false,
						error: typeof envelope.error === "string" ? envelope.error : body?.error ?? "读取插件设置失败"
					};
					return {
						ok: true,
						namespaces: body.value?.namespaces ?? []
					};
				},
				update: async (ns, patch) => {
					const remote = ctx.get("remote.looklook");
					if (remote?.updateSettings === void 0) return {
						ok: false,
						error: "插件设置服务未就绪"
					};
					const envelope = await remote.updateSettings({
						ns,
						patch
					});
					const body = envelope.value;
					if (!envelope.ok || body?.ok !== true) return {
						ok: false,
						error: typeof envelope.error === "string" ? envelope.error : body?.error ?? "更新插件设置失败"
					};
					for (const listener of pluginSettingsListeners) listener();
					return { ok: true };
				},
				describeCredentials: async (refs) => {
					const remote = ctx.get("remote.looklook");
					if (remote?.describeCredentials === void 0) return {
						ok: false,
						error: "插件凭据服务未就绪"
					};
					const envelope = await remote.describeCredentials(refs);
					const body = envelope.value;
					if (!envelope.ok || body?.ok !== true) return {
						ok: false,
						error: typeof envelope.error === "string" ? envelope.error : body?.error ?? "读取插件凭据失败"
					};
					return {
						ok: true,
						credentials: body.credentials ?? {}
					};
				},
				setCredential: async (ref, value) => {
					const remote = ctx.get("remote.looklook");
					if (remote?.setCredential === void 0) return {
						ok: false,
						error: "插件凭据服务未就绪"
					};
					const envelope = await remote.setCredential({
						ref,
						value
					});
					const body = envelope.value;
					if (!envelope.ok || body?.ok !== true) return {
						ok: false,
						error: typeof envelope.error === "string" ? envelope.error : body?.error ?? "保存插件凭据失败"
					};
					return { ok: true };
				}
			};
			const eyes = /* @__PURE__ */ new Map();
			const eyeFor = (sessionId) => {
				let controller = eyes.get(sessionId);
				if (controller === void 0) {
					controller = createEyeController(pluginSettings, sessionId);
					controller.load();
					eyes.set(sessionId, controller);
				}
				return controller;
			};
			const features = createFeatureController(pluginSettings);
			features.load();
			const useFeaturesSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(features.store);
			/** Whether the plugin master switch is ON (gates the eye toggle, the
			* settings card's model sections, and every file-channel interception). */
			const usePluginEnabled = () => useFeaturesSnapshot((s) => s.status === "ready" && s.enabled !== false);
			const useFeatures = () => useFeaturesSnapshot((s) => s);
			const refreshPluginState = () => {
				for (const controller of eyes.values()) controller.load();
				features.load();
			};
			pluginSettings.subscribe(refreshPluginState);
			ctx.effect(() => {
				const dispose = ctx.remote.$on("settings/document-updated", refreshPluginState);
				return () => {
					dispose();
				};
			}, "dsh-looklook: settings invalidation fan-out");
			/** Strict wire schema for the discovery request (Typert requires strict codecs). */
			const parseProvider = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("provider must be an object");
				const record = value;
				if (typeof record.baseURL !== "string" || typeof record.apiKeyEnv !== "string") throw new Error("provider requires baseURL and apiKeyEnv strings");
				return {
					baseURL: record.baseURL,
					apiKeyEnv: record.apiKeyEnv,
					...typeof record.apiKey === "string" ? { apiKey: record.apiKey } : {}
				};
			};
			/** Strict wire schema for the discovery result. */
			const parseResult = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("result must be an object");
				const record = value;
				if (record.ok === true && Array.isArray(record.models) && record.models.every((item) => typeof item === "string")) return {
					ok: true,
					models: record.models
				};
				if (record.ok === false && typeof record.error === "string") return {
					ok: false,
					error: record.error
				};
				throw new Error("result must be { ok: true, models } or { ok: false, error }");
			};
			/** Strict wire schema for the upload payload. */
			const parseUploadPayload = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("payload must be an object");
				const record = value;
				if (typeof record.sessionId !== "string" || typeof record.name !== "string" || typeof record.data !== "string") throw new Error("payload requires sessionId, name and data strings");
				return {
					sessionId: record.sessionId,
					name: record.name,
					data: record.data
				};
			};
			/** Strict wire schema for the upload result. */
			const parseUploadResult = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("result must be an object");
				const record = value;
				if (record.ok === true && typeof record.path === "string" && typeof record.name === "string" && typeof record.size === "number") return {
					ok: true,
					path: record.path,
					name: record.name,
					size: record.size
				};
				if (record.ok === false && typeof record.error === "string") return {
					ok: false,
					error: record.error
				};
				throw new Error("result must be { ok: true, path, name, size } or { ok: false, error }");
			};
			/** Strict wire schema for the ASR status. */
			const parseAsrStatus = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("status must be an object");
				const record = value;
				if (typeof record.installed !== "boolean" || typeof record.phase !== "string") throw new Error("status requires installed and phase");
				return {
					installed: record.installed,
					phase: record.phase,
					model: typeof record.model === "string" ? record.model : "medium",
					error: typeof record.error === "string" ? record.error : null
				};
			};
			/** Strict wire schema for the ASR install trigger. */
			const parseAsrInstallResult = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("result must be an object");
				const record = value;
				if (record.ok === true && typeof record.phase === "string") return {
					ok: true,
					phase: record.phase,
					already: record.already === true
				};
				if (record.ok === false && typeof record.error === "string") return {
					ok: false,
					error: record.error
				};
				throw new Error("result must be { ok: true, phase } or { ok: false, error }");
			};
			/** Strict wire schema for the session id argument. */
			const parseSessionId = (value) => {
				if (typeof value !== "string" || value === "") throw new Error("sessionId must be a non-empty string");
				return value;
			};
			/** Strict wire schema for the modality result. */
			const parseModalityResult = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("result must be an object");
				const record = value;
				if (record.ok === true && typeof record.supportsImage === "boolean") return {
					ok: true,
					supportsImage: record.supportsImage
				};
				if (record.ok === false && typeof record.error === "string") return {
					ok: false,
					error: record.error
				};
				throw new Error("result must be { ok: true, supportsImage } or { ok: false, error }");
			};
			/** Strict wire schema for the read-upload payload. */
			const parseReadUploadPayload = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("payload must be an object");
				const record = value;
				if (typeof record.sessionId !== "string" || typeof record.name !== "string") throw new Error("payload requires sessionId and name strings");
				return {
					sessionId: record.sessionId,
					name: record.name
				};
			};
			/** Strict wire schema for the read-upload result. */
			const parseReadUploadResult = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("result must be an object");
				const record = value;
				if (record.ok === true && typeof record.mediaType === "string" && typeof record.data === "string") return {
					ok: true,
					mediaType: record.mediaType,
					data: record.data
				};
				if (record.ok === false && typeof record.error === "string") return {
					ok: false,
					error: record.error
				};
				throw new Error("result must be { ok: true, mediaType, data } or { ok: false, error }");
			};
			/** Loose wire schema: pass the business object through unchanged (the host
			* shapes are validated by the caller-side wrappers). */
			const parseAsIs = (value) => value;
			/** Strict wire schema for the env-repair action. */
			const parseEnvRepairAction = (value) => {
				if (value === "install-yt-dlp" || value === "install-asr") return value;
				throw new Error("action must be install-yt-dlp or install-asr");
			};
			/** Strict wire schema for the test-provider probe. */
			const parseTestProvider = (value) => {
				if (typeof value !== "object" || value === null) throw new Error("provider must be an object");
				const record = value;
				if (typeof record.baseURL !== "string" || typeof record.apiKeyEnv !== "string" || typeof record.model !== "string") throw new Error("provider requires baseURL, apiKeyEnv and model strings");
				return {
					baseURL: record.baseURL,
					apiKeyEnv: record.apiKeyEnv,
					model: record.model,
					...typeof record.apiKey === "string" ? { apiKey: record.apiKey } : {}
				};
			};
			ctx.effect(() => {
				const mounting = ctx.remote.$mount({
					package: "dsh-looklook",
					descriptors: [
						{
							id: "looklook.describeSettings",
							service: "looklookRemote",
							namespace: "looklook",
							method: "describeSettings",
							invocation: { kind: "direct" },
							parameters: [],
							result: {
								mode: "strict",
								typeSymbol: "LooklookSettingsResult",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.updateSettings",
							service: "looklookRemote",
							namespace: "looklook",
							method: "updateSettings",
							invocation: { kind: "direct" },
							parameters: [{
								name: "payload",
								wire: "payload",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "LooklookSettingsUpdate",
									schema: { parse: parseAsIs }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookSettingsUpdateResult",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.describeCredentials",
							service: "looklookRemote",
							namespace: "looklook",
							method: "describeCredentials",
							invocation: { kind: "direct" },
							parameters: [{
								name: "refs",
								wire: "refs",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "LooklookCredentialRefs",
									schema: { parse: parseAsIs }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookCredentialsResult",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.setCredential",
							service: "looklookRemote",
							namespace: "looklook",
							method: "setCredential",
							invocation: { kind: "direct" },
							parameters: [{
								name: "payload",
								wire: "payload",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "LooklookCredentialPayload",
									schema: { parse: parseAsIs }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookCredentialResult",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.listModels",
							service: "looklookRemote",
							namespace: "looklook",
							method: "listModels",
							invocation: { kind: "direct" },
							parameters: [{
								name: "provider",
								wire: "provider",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "VisionProviderProbe",
									schema: { parse: parseProvider }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookListModelsResult",
								schema: { parse: parseResult }
							}
						},
						{
							id: "looklook.upload",
							service: "looklookRemote",
							namespace: "looklook",
							method: "upload",
							invocation: { kind: "direct" },
							parameters: [{
								name: "payload",
								wire: "payload",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "LooklookUploadPayload",
									schema: { parse: parseUploadPayload }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookUploadResult",
								schema: { parse: parseUploadResult }
							}
						},
						{
							id: "looklook.asrStatus",
							service: "looklookRemote",
							namespace: "looklook",
							method: "asrStatus",
							invocation: { kind: "direct" },
							parameters: [],
							result: {
								mode: "strict",
								typeSymbol: "LooklookAsrStatus",
								schema: { parse: parseAsrStatus }
							}
						},
						{
							id: "looklook.asrInstall",
							service: "looklookRemote",
							namespace: "looklook",
							method: "asrInstall",
							invocation: { kind: "direct" },
							parameters: [],
							result: {
								mode: "strict",
								typeSymbol: "LooklookAsrInstallResult",
								schema: { parse: parseAsrInstallResult }
							}
						},
						{
							id: "looklook.sessionModality",
							service: "looklookRemote",
							namespace: "looklook",
							method: "sessionModality",
							invocation: { kind: "direct" },
							parameters: [{
								name: "sessionId",
								wire: "sessionId",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "SessionId",
									schema: { parse: parseSessionId }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookModalityResult",
								schema: { parse: parseModalityResult }
							}
						},
						{
							id: "looklook.readUpload",
							service: "looklookRemote",
							namespace: "looklook",
							method: "readUpload",
							invocation: { kind: "direct" },
							parameters: [{
								name: "payload",
								wire: "payload",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "LooklookReadUploadPayload",
									schema: { parse: parseReadUploadPayload }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookReadUploadResult",
								schema: { parse: parseReadUploadResult }
							}
						},
						{
							id: "looklook.envCheck",
							service: "looklookRemote",
							namespace: "looklook",
							method: "envCheck",
							invocation: { kind: "direct" },
							parameters: [],
							result: {
								mode: "strict",
								typeSymbol: "LooklookEnvCheckReport",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.envRepair",
							service: "looklookRemote",
							namespace: "looklook",
							method: "envRepair",
							invocation: { kind: "direct" },
							parameters: [{
								name: "action",
								wire: "action",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "EnvRepairAction",
									schema: { parse: parseEnvRepairAction }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookEnvCheckItem",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.testVision",
							service: "looklookRemote",
							namespace: "looklook",
							method: "testVision",
							invocation: { kind: "direct" },
							parameters: [{
								name: "provider",
								wire: "provider",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "TestProviderProbe",
									schema: { parse: parseTestProvider }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookTestVisionResult",
								schema: { parse: parseAsIs }
							}
						},
						{
							id: "looklook.testAudio",
							service: "looklookRemote",
							namespace: "looklook",
							method: "testAudio",
							invocation: { kind: "direct" },
							parameters: [{
								name: "provider",
								wire: "provider",
								source: "json",
								codec: {
									mode: "strict",
									typeSymbol: "TestProviderProbe",
									schema: { parse: parseTestProvider }
								}
							}],
							result: {
								mode: "strict",
								typeSymbol: "LooklookTestAudioResult",
								schema: { parse: parseAsIs }
							}
						}
					]
				});
				return () => {
					mounting.then((dispose) => dispose());
				};
			}, "dsh-looklook: remote RPCs");
			/** Call the host discovery RPC once the namespace is mounted. */
			const listModels = async (provider) => {
				const remote = ctx.get("remote.looklook");
				if (remote?.listModels === void 0) return {
					ok: false,
					error: "模型服务未就绪"
				};
				const envelope = await remote.listModels(provider);
				if (!envelope.ok) return {
					ok: false,
					error: typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "模型服务请求失败"
				};
				const business = envelope.value;
				if (business?.ok === true) return {
					ok: true,
					models: business.models ?? []
				};
				return {
					ok: false,
					error: typeof business?.error === "string" ? business.error : "获取模型失败"
				};
			};
			/** Upload one file through the authorized RPC. */
			const uploadFileRpc = async (sessionId, file, onProgress) => {
				return await uploadFile(ctx.get("remote.looklook"), sessionId, file, onProgress);
			};
			/**
			* Upload a batch of files through the file channel (used by drop, paste,
			* and the + button picker). Each file becomes an immediate pending chip
			* (spinner + progress); the path lands when the RPC completes, and nothing
			* is sent until the user presses Enter. Failed uploads keep their chip with
			* the error visible.
			*/
			const stageUploads = (sessionId, files, controller) => {
				(async () => {
					for (const file of files) {
						const staged = {
							name: file.name,
							size: file.size,
							...file.type.startsWith("image/") ? { previewUrl: URL.createObjectURL(file) } : {},
							uploading: true,
							progress: 0
						};
						controller.add(sessionId, staged);
						const id = controller.get(sessionId)[controller.get(sessionId).length - 1]?.id;
						if (id === void 0) continue;
						try {
							const { path, name } = await uploadFileRpc(sessionId, file, (percent) => {
								controller.updateById(sessionId, id, { progress: percent });
							});
							controller.updateById(sessionId, id, {
								path,
								...name !== void 0 ? { name } : {},
								uploading: false,
								progress: 100,
								error: void 0
							});
						} catch (error) {
							console.error("looklook upload failed:", file.name, error);
							controller.updateById(sessionId, id, {
								uploading: false,
								error: error instanceof Error ? error.message : String(error)
							});
						}
					}
				})();
			};
			/** Ask the host whether the session's current model accepts image input. */
			const sessionModality = async (sessionId) => {
				const remote = ctx.get("remote.looklook");
				if (remote?.sessionModality === void 0) return {
					ok: false,
					error: "模态查询服务未就绪"
				};
				const envelope = await remote.sessionModality(sessionId);
				if (!envelope.ok) return {
					ok: false,
					error: typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "模态查询失败"
				};
				const business = envelope.value;
				if (business?.ok === true) return {
					ok: true,
					supportsImage: business.supportsImage === true
				};
				return {
					ok: false,
					error: typeof business?.error === "string" ? business.error : "模态查询失败"
				};
			};
			/** Read the local ASR install state through the authorized RPC. */
			const asrStatus = async () => {
				const remote = ctx.get("remote.looklook");
				if (remote?.asrStatus === void 0) throw new Error("ASR 状态服务未就绪");
				const envelope = await remote.asrStatus();
				if (!envelope.ok) throw new Error("ASR 状态查询失败");
				const value = envelope.value;
				if (value === void 0) throw new Error("ASR 状态查询失败");
				return {
					installed: value.installed === true,
					phase: value.phase,
					model: value.model,
					options: Array.isArray(value.options) ? value.options : [],
					error: value.error ?? null
				};
			};
			/** Trigger the local ASR install for one model through the authorized RPC.
			*  The model is EXCLUSIVE on the host: installing a different size purges
			*  the previous one. */
			const asrInstall = async (model) => {
				const remote = ctx.get("remote.looklook");
				if (remote?.asrInstall === void 0) return {
					ok: false,
					error: "ASR 安装服务未就绪"
				};
				const envelope = await remote.asrInstall({ model });
				if (!envelope.ok) return {
					ok: false,
					error: typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "ASR 安装失败"
				};
				const business = envelope.value;
				if (business?.ok === true) return {
					ok: true,
					phase: business.phase,
					already: business.already === true
				};
				return {
					ok: false,
					error: typeof business?.error === "string" ? business.error : "ASR 安装失败"
				};
			};
			/** Run the environment self-check (settings dialog). */
			const envCheck = async () => {
				const remote = ctx.get("remote.looklook");
				if (remote?.envCheck === void 0) throw new Error("环境检测服务未就绪");
				const envelope = await remote.envCheck();
				if (!envelope.ok) throw new Error(typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "环境检测失败");
				const report = envelope.value;
				if (report === void 0) throw new Error("环境检测失败");
				return report;
			};
			/** One-click repair for one env item; returns the item's fresh state. */
			const envRepair = async (action) => {
				const remote = ctx.get("remote.looklook");
				if (remote?.envRepair === void 0) throw new Error("修复服务未就绪");
				const envelope = await remote.envRepair(action);
				if (!envelope.ok) throw new Error(typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "修复失败");
				const item = envelope.value;
				if (item === void 0) throw new Error("修复失败");
				return item;
			};
			/** Probe whether one vision provider can actually see images. */
			const testVision = async (provider) => {
				const remote = ctx.get("remote.looklook");
				if (remote?.testVision === void 0) return {
					ok: false,
					error: "测试服务未就绪"
				};
				const envelope = await remote.testVision(provider);
				if (!envelope.ok) return {
					ok: false,
					error: typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "测试失败"
				};
				const business = envelope.value;
				if (business?.ok === true) return {
					ok: true,
					supportsImage: business.supportsImage === true,
					message: business.message ?? ""
				};
				return {
					ok: false,
					error: typeof business?.error === "string" ? business.error : "测试失败"
				};
			};
			/** Probe one audio provider's capability level (L1/L2/none). */
			const testAudio = async (provider) => {
				const remote = ctx.get("remote.looklook");
				if (remote?.testAudio === void 0) return {
					ok: false,
					error: "测试服务未就绪"
				};
				const envelope = await remote.testAudio(provider);
				if (!envelope.ok) return {
					ok: false,
					error: typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "测试失败"
				};
				const business = envelope.value;
				if (business?.ok === true) return {
					ok: true,
					level: business.level ?? "none",
					message: business.message ?? ""
				};
				return {
					ok: false,
					error: typeof business?.error === "string" ? business.error : "测试失败"
				};
			};
			const modalityCache = /* @__PURE__ */ new Map();
			const cachedSupportsImage = (sessionId) => modalityCache.get(sessionId);
			const probeModality = (sessionId, retriesLeft = 2) => {
				sessionModality(sessionId).then((result) => {
					if (result.ok) {
						modalityCache.set(sessionId, result.supportsImage);
						return;
					}
					if (retriesLeft > 0) window.setTimeout(() => probeModality(sessionId, retriesLeft - 1), 600);
				}).catch(() => {});
			};
			ctx.effect(() => {
				const sync = () => {
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId === void 0 || sessionId === "") return;
					probeModality(sessionId);
				};
				const dispose = sessions.currentProvideInfo.subscribe(sync);
				sync();
				return () => {
					dispose();
				};
			}, "dsh-looklook: modality cache");
			ctx.effect(() => {
				const dispose = ctx.remote.$on("settings/document-updated", () => {
					modalityCache.clear();
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId !== void 0 && sessionId !== "") probeModality(sessionId);
				});
				return () => {
					dispose();
				};
			}, "dsh-looklook: modality invalidation");
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: PLUGIN_CARD_ID,
				priority: 30,
				inject: () => ({
					api: connection.api,
					pluginSettings,
					t,
					features,
					useFeatures,
					listModels,
					testVision,
					testAudio,
					asrStatus,
					asrInstall,
					envCheck,
					envRepair,
					usePluginEnabled
				})
			}, LooklookPluginCard));
			ctx.effect(() => {
				const onDragOverCapture = (event) => {
					if (event.dataTransfer?.types.includes("Files") === true) event.preventDefault();
				};
				const onDropCapture = (event) => {
					const master = features.store.getSnapshot();
					if (master.status === "ready" && master.enabled === false) return;
					const files = [...event.dataTransfer?.files ?? []];
					if (files.length === 0) return;
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId === void 0 || sessionId === "") return;
					if (!files.some((file) => isUploadableName(file.name))) {
						const eye = eyeFor(sessionId).store.getSnapshot();
						if (eye.status === "ready" && eye.eye === "off") return;
						if (cachedSupportsImage(sessionId) === true) return;
					}
					event.preventDefault();
					event.stopPropagation();
					window.dispatchEvent(new DragEvent("dragend"));
					stageUploads(sessionId, files, pending);
				};
				document.addEventListener("dragover", onDragOverCapture, true);
				document.addEventListener("drop", onDropCapture, true);
				const onPasteCapture = (event) => {
					if (event.clipboardData === null) return;
					const master = features.store.getSnapshot();
					if (master.status === "ready" && master.enabled === false) return;
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId === void 0 || sessionId === "") return;
					const imageFiles = [...event.clipboardData.items].filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file) => file !== null);
					if (imageFiles.length === 0) return;
					const eye = eyeFor(sessionId).store.getSnapshot();
					if (eye.status === "ready" && eye.eye === "off") return;
					if (cachedSupportsImage(sessionId) === true) return;
					event.preventDefault();
					event.stopPropagation();
					stageUploads(sessionId, imageFiles, pending);
				};
				document.addEventListener("paste", onPasteCapture, true);
				const onChangeCapture = (event) => {
					const input = event.target;
					if (!(input instanceof HTMLInputElement)) return;
					if (input.type !== "file") return;
					const master = features.store.getSnapshot();
					if (master.status === "ready" && master.enabled === false) return;
					const files = [...input.files ?? []];
					if (files.length === 0) return;
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId === void 0 || sessionId === "") return;
					if (!files.some((file) => isUploadableName(file.name))) {
						const eye = eyeFor(sessionId).store.getSnapshot();
						if (eye.status === "ready" && eye.eye === "off") return;
						if (cachedSupportsImage(sessionId) === true) return;
					}
					event.preventDefault();
					event.stopPropagation();
					input.value = "";
					stageUploads(sessionId, files, pending);
				};
				document.addEventListener("change", onChangeCapture, true);
				return () => {
					document.removeEventListener("dragover", onDragOverCapture, true);
					document.removeEventListener("drop", onDropCapture, true);
					document.removeEventListener("paste", onPasteCapture, true);
					document.removeEventListener("change", onChangeCapture, true);
				};
			}, "dsh-looklook: file drag-and-drop");
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: PENDING_ID,
				inject: (sessionId) => {
					ensureSubmitPatched(sessionId);
					return {
						t,
						pending,
						usePending,
						sessionId
					};
				}
			}, FileChips));
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: TOGGLE_ID,
				inject: (sessionId) => {
					const controller = eyeFor(sessionId);
					return {
						controller,
						useSnapshot: (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(controller.store),
						t,
						usePluginEnabled
					};
				}
			}, VisionToggle));
			const chatNodeInject = () => {
				const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId ?? "";
				const loadUpload = async (sid, name) => {
					const remote = ctx.get("remote.looklook");
					if (remote?.readUpload === void 0) return {
						ok: false,
						error: "图片读取服务未就绪"
					};
					const envelope = await remote.readUpload({
						sessionId: sid,
						name
					});
					if (!envelope.ok) return {
						ok: false,
						error: typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "图片读取失败"
					};
					const business = envelope.value;
					if (business?.ok === true && typeof business.mediaType === "string" && typeof business.data === "string") return {
						ok: true,
						mediaType: business.mediaType,
						data: business.data
					};
					return {
						ok: false,
						error: typeof business?.error === "string" ? business.error : "图片读取失败"
					};
				};
				return {
					sessionId,
					loadUpload
				};
			};
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "user",
				priority: -1,
				locale: NS,
				inject: chatNodeInject
			}, LooklookUserMessageNodeView));
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "steering",
				priority: -1,
				locale: NS,
				inject: chatNodeInject
			}, LooklookUserMessageNodeView));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map