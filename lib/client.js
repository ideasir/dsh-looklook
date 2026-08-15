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
		//#region src/client/eye-controller.ts
		/** Load one settings describe result down to the `vision` namespace value. */
		function visionSettingsOf(namespaces) {
			if (!Array.isArray(namespaces)) return void 0;
			const entry = namespaces.find((namespace) => typeof namespace === "object" && namespace !== null && namespace.ns === "vision");
			const value = entry !== void 0 ? entry.value : void 0;
			return typeof value === "object" && value !== null ? value : void 0;
		}
		/** Create the controller for one session. */
		function createEyeController(api, sessionId) {
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({ status: "loading" });
			const refresh = async () => {
				const response = await api.settings.describe({});
				if (!response.result.ok) {
					store.set({
						status: "ready",
						eye: "on",
						unconfigured: true
					});
					return;
				}
				const vision = visionSettingsOf(response.result.value.namespaces);
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
						await api.settings.update({
							ns: "vision",
							patch: { sessionOverrides: { [sessionId]: next } }
						});
						refresh();
					})();
				}
			};
		}
		//#endregion
		//#region src/client/feature-controller.ts
		function looklookSettingsOf(namespaces) {
			if (!Array.isArray(namespaces)) return void 0;
			const entry = namespaces.find((namespace) => typeof namespace === "object" && namespace !== null && namespace.ns === "looklook");
			const value = entry !== void 0 ? entry.value : void 0;
			return typeof value === "object" && value !== null ? value : void 0;
		}
		/** Create the plugin feature controller. */
		function createFeatureController(api) {
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({ status: "loading" });
			const refresh = async () => {
				const response = await api.settings.describe({});
				if (!response.result.ok) {
					store.set({
						status: "ready",
						multimodal: true,
						moreExtensions: true
					});
					return;
				}
				const value = looklookSettingsOf(response.result.value.namespaces);
				store.set({
					status: "ready",
					multimodal: value?.multimodal !== false,
					moreExtensions: value?.moreExtensions !== false
				});
			};
			const update = async (patch) => {
				await api.settings.update({
					ns: "looklook",
					patch
				});
				refresh();
			};
			return {
				store,
				load: () => {
					refresh();
				},
				setMultimodal: (next) => {
					update({ multimodal: next });
				},
				setMoreExtensions: (next) => {
					update({ moreExtensions: next });
				}
			};
		}
		//#endregion
		//#region src/client/pending-files.ts
		/** Create the pending-files controller. */
		function createPendingFilesController() {
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({});
			const get = (sessionId) => store.getSnapshot()[sessionId] ?? [];
			return {
				store,
				add: (sessionId, file) => {
					store.set({
						...store.getSnapshot(),
						[sessionId]: [...get(sessionId), file]
					});
				},
				remove: (sessionId, index) => {
					const next = get(sessionId).filter((_, i) => i !== index);
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
		function formatSize$1(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1048576).toFixed(1)} MB`;
		}
		/** A rendered attachment card: icon + name + size. */
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
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					width: "18",
					height: "18",
					viewBox: "0 0 24 24",
					fill: "none",
					"aria-hidden": "true",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M12 3l6 6h-4v8h-4v-8H6l6-6z",
						fill: "currentColor"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 19h16",
						stroke: "currentColor",
						strokeWidth: "1.8",
						strokeLinecap: "round"
					})]
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
						children: formatSize$1(file.size)
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
		*/
		function LooklookUserMessageNodeView(props) {
			const content = props.node?.data?.content;
			if (!Array.isArray(content)) {
				const fallback = content?.text;
				return typeof fallback === "string" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						whiteSpace: "pre-wrap",
						wordBreak: "break-word"
					},
					children: fallback
				}) : null;
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
			}).trim();
			if (attachments.length === 0 && files.length === 0 && trimmed.length === 0) return null;
			const load = props.loadImage ?? (() => Promise.reject(/* @__PURE__ */ new Error("image loader unavailable")));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: 6,
					margin: "8px 0"
				},
				children: [
					files.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							justifyContent: "flex-end"
						},
						children: files.map((file, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileCard, { file }, `${file.path}-${index}`))
					}),
					attachments.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							justifyContent: "flex-end"
						},
						children: attachments.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LooklookThumb, {
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
		const css$1 = {
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
			installRow: {
				display: "flex",
				alignItems: "center",
				gap: 10
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
		/** One switch row (slider left, label + description right). */
		function SwitchRow({ label, desc, checked, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: css$1.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderSwitch, {
					checked,
					onChange,
					label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: css$1.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: css$1.rowName,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: css$1.rowDesc,
						children: desc
					})]
				})]
			});
		}
		/** The master-switch + install-support body. */
		function LooklookFeaturesSection(props) {
			const { t, features, useFeatures } = props;
			const state = useFeatures();
			const ready = state.status === "ready";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: css$1.stack,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: css$1.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: css$1.heading,
							children: t("features.switches.heading")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: t("features.extensions.label"),
							desc: t("features.extensions.desc"),
							checked: ready && state.moreExtensions,
							onChange: (next) => features.setMoreExtensions(next)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							label: t("features.multimodal.label"),
							desc: t("features.multimodal.desc"),
							checked: ready && state.multimodal,
							onChange: (next) => features.setMultimodal(next)
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/VisionSettings.tsx
		/**
		* VisionSettings: the "视觉模型" settings section (`settings.section`).
		*
		* Rendered with the same design system as the Models settings page:
		* ui-primitives atoms (Button / Input / StateDot / icons) and --dsw-* tokens.
		* Providers list in failover order (primary first); edits are draft-local
		* until Save, which writes credentials (per-provider API key) and the
		* `vision` settings namespace in one commit.
		*/
		/** Derive a credential reference for one provider id. */
		function credentialRefFor(id) {
			return `LOOKLOOK_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
		}
		function visionProvidersOf(namespaces) {
			if (!Array.isArray(namespaces)) return [];
			const entry = namespaces.find((namespace) => typeof namespace === "object" && namespace !== null && namespace.ns === "vision");
			const value = entry !== void 0 ? entry.value : void 0;
			if (typeof value !== "object" || value === null) return [];
			return Array.isArray(value.providers) ? value.providers ?? [] : [];
		}
		function newProviderId() {
			return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
		}
		/**
		* Shared layout matching the settings-panel design language (the same one
		* ModelsSection uses): every color resolves through a `--dsw-alias-*` token
		* so light and dark themes both render correctly — bare `--border`/`--surface`
		* names or literal fallbacks would stay light under the dark theme.
		*/
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
		/** The settings section body, styled like the Models page. */
		function VisionSettingsSection(props) {
			const { useMultimodal } = props;
			if (!useMultimodal()) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VisionSettingsBody, { ...props });
		}
		/**
		* The full vision-config editor. Every state hook lives here, so the hook
		* order stays consistent for as long as the component is mounted (it only
		* mounts while multimodal is ON — the wrapper above decides).
		*/
		function VisionSettingsBody(props) {
			const { api, t, listModels } = props;
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
			(0, react.useEffect)(() => {
				(async () => {
					const response = await api.settings.describe({});
					if (response.result.ok) {
						const loaded = visionProvidersOf(response.result.value.namespaces);
						setProviders(loaded);
						const refs = loaded.map((provider) => credentialRefFor(provider.id));
						if (refs.length > 0) {
							const cred = await api.credentials.describe({ refs });
							if (cred.result.ok) {
								const next = {};
								for (const provider of loaded) next[provider.id] = cred.result.value.credentials[credentialRefFor(provider.id)]?.configured === true;
								setKeyStates(next);
							}
						}
					}
					setLoaded(true);
				})();
			}, [api]);
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
			/** Probe the provider's `/models` endpoint with its stored API key. */
			const fetchModels = async (draft) => {
				setFetchError(null);
				setFetching(draft.id);
				try {
					if (typeof draft.baseURL !== "string" || draft.baseURL.trim() === "") {
						setFetchError(t("settings.provider.baseURLRequired"));
						return;
					}
					const result = await listModels({
						baseURL: draft.baseURL,
						apiKeyEnv: credentialRefFor(draft.id)
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
			const save = async () => {
				setSaving(true);
				setNotice(null);
				try {
					const nextProviders = addDraft === null ? providers : [...providers, addDraft];
					const freshKeys = nextProviders.filter((provider) => provider.apiKey !== void 0 && provider.apiKey.length > 0);
					for (const provider of freshKeys) {
						const stored = await api.credentials.set({
							ref: credentialRefFor(provider.id),
							value: provider.apiKey ?? ""
						});
						if (!stored.result.ok) throw new Error(stored.result.error.message);
					}
					const update = await api.settings.update({
						ns: "vision",
						patch: { providers: nextProviders.map(({ id, name, baseURL, model, enabled }) => ({
							id,
							name,
							baseURL,
							model,
							enabled,
							apiKeyEnv: credentialRefFor(id)
						})) }
					});
					if (!update.result.ok) throw new Error(update.result.error.message);
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
			/**
			* One editor card (add or edit): the same filled editor surface as a
			* provider editor. `draft` and `onPatch` come from the caller so the draft
			* stays stable across renders (add mode keeps its own state; edit mode
			* patches the providers array).
			*/
			const renderEditor = (draft, onPatch, _isNew) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "sm",
									disabled: fetching === draft.id,
									onClick: () => void fetchModels(draft),
									children: fetching === draft.id ? "…" : t("settings.provider.fetchModels")
								}), fetchError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: layout.error,
									children: fetchError
								})]
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
						children: t("settings.nav")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: layout.intro,
						children: t("settings.intro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: layout.hint,
						children: t("settings.failoverHint")
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
							editingId === provider.id && editing !== void 0 && renderEditor(editing, (next) => patch(editing.id, next), false)
						]
					}, provider.id)),
					addDraft !== null && renderEditor(addDraft, (next) => setAddDraft((current) => ({
						...current,
						...next
					})), true),
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
		//#region src/client/PluginTab.tsx
		/**
		* LooklookPluginCard: the looklook configuration card inside the Plugins
		* settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
		* collapsible card chrome as the agent-loop / bash / web-search cards:
		* a header (title + description + chevron) that discloses the controls:
		* - the master switches (多模态 / ZIP) and the 7z install support;
		* - the vision-model configuration, visible while 多模态 is ON.
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
			const { api, t, features, useFeatures, listModels, useMultimodal } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const multimodalOn = useMultimodal();
			const featuresProps = {
				api,
				t,
				features,
				useFeatures
			};
			const visionProps = {
				api,
				t,
				listModels,
				useMultimodal
			};
			const title = t("card.title");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: css.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
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
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: css.body,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LooklookFeaturesSection, { ...featuresProps }), multimodalOn && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
						border: "none",
						borderTop: "1px solid var(--dsw-alias-border-l2)"
					} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VisionSettingsSection, { ...visionProps })] })]
				})]
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
			const { controller, useSnapshot, useMultimodal, t } = props;
			const multimodalOn = useMultimodal();
			const state = useSnapshot((s) => s);
			if (!multimodalOn) return null;
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
		function formatSize(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1048576).toFixed(1)} MB`;
		}
		/** One chip card (hover reveals the remove ×). */
		function FileChips(props) {
			const { t, pending, usePending, sessionId, onSend, sending, sendError } = props;
			const list = usePending((state) => state[sessionId]) ?? [];
			if (list.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
						gap: 8,
						padding: "6px 10px",
						borderRadius: "12px 12px 0 0",
						background: "var(--dsw-specific-tip)",
						border: "1px solid var(--dsw-alias-border-l1)",
						borderBottom: "none"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							marginLeft: "auto",
							display: "inline-flex",
							alignItems: "center",
							gap: 8
						},
						children: [sendError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 12,
								color: "var(--dsw-alias-state-warn-label)"
							},
							children: sendError
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: sending,
							onClick: onSend,
							style: {
								flex: "none",
								padding: "2px 10px",
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: 999,
								background: "var(--dsw-alias-button-elevated-fill)",
								cursor: sending ? "default" : "pointer",
								fontSize: 12,
								lineHeight: "18px",
								color: "var(--dsw-alias-label-primary)",
								opacity: sending ? .6 : 1
							},
							children: sending ? t("upload.sending") : t("upload.send")
						})]
					}), list.map((file, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							maxWidth: 260,
							padding: "3px 8px 3px 6px",
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: 8,
							background: "var(--dsw-alias-bg-layer-2)",
							fontSize: 12,
							lineHeight: "18px",
							color: "var(--dsw-alias-label-primary)"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
								width: "12",
								height: "12",
								viewBox: "0 0 24 24",
								fill: "none",
								"aria-hidden": "true",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: "M12 3l6 6h-4v8h-4v-8H6l6-6z",
									fill: "currentColor"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: "M4 19h16",
									stroke: "currentColor",
									strokeWidth: "1.8",
									strokeLinecap: "round"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
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
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `${t("upload.remove")}: ${file.name}`,
								onClick: () => pending.remove(sessionId, index),
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
							})
						]
					}, file.path))]
				})
			});
		}
		//#endregion
		//#region src/client/upload-shared.ts
		/**
		* Shared upload logic for dsh-looklook: upload one or more archive/video
		* files through the plugin's `/api/looklook-upload` route (saved into the
		* session workspace `.uploads/`) and return their paths. The caller stages
		* the notes into the input draft — nothing is sent until the user presses
		* Enter.
		*/
		/** Accepted extensions (archives + video). */
		const ACCEPT_EXTENSIONS = [
			".zip",
			".7z",
			".mp4",
			".mov",
			".avi",
			".mkv",
			".webm",
			".flv",
			".wmv",
			".m4v"
		];
		/** Whether a file name is uploadable through the looklook channel. */
		function isUploadableName(name) {
			const lower = name.toLowerCase();
			return ACCEPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
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
		/** Upload one file; returns the absolute path the host saved. */
		async function uploadFile(sessionId, file) {
			const data = await fileToBase64(file);
			const response = await fetch("/api/looklook-upload", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					sessionId,
					name: file.name,
					data
				})
			});
			const body = await response.json();
			if (body.ok !== true || body.path === void 0) throw new Error(body.error ?? `上传失败（HTTP ${response.status}）`);
			return {
				path: body.path,
				name: file.name
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/** dsh-looklook client copy. Product copy is Chinese; English mirrors it. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"settings.nav": "视觉模型",
			"settings.intro": "配置用于识别图片的视觉模型。支持多个提供商：第一个为主模型，其余为备用；主模型不可用时自动降级到备用模型。",
			"settings.provider.header": "视觉模型提供商",
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
			"settings.provider.removeConfirm": "确定删除该提供商？",
			"settings.provider.empty": "尚未配置视觉模型提供商。",
			"settings.save": "保存",
			"settings.cancel": "取消",
			"settings.saved": "已保存",
			"settings.saveFailed": "保存失败",
			"settings.failoverHint": "顺序即降级顺序：第一个启用的提供商为主模型，主模型失败时依次使用后续提供商。",
			"eye.on": "视觉增强已开启：图片将由视觉模型识别后交给对话模型",
			"eye.off": "视觉增强已关闭：图片将直接发送给对话模型",
			"eye.unconfigured": "视觉增强已开启，但未配置视觉模型 → 点击前往设置",
			"card.title": "看看",
			"card.desc": "多模态与文件上传支持",
			"card.expand": "展开",
			"card.collapse": "收起",
			"features.switches.heading": "功能开关",
			"features.extensions.label": "支持更多扩展名",
			"features.extensions.desc": "开启后支持更多扩展名（.7z 压缩包、视频等）；关闭后仅支持 .zip。",
			"features.multimodal.label": "支持多模态",
			"features.multimodal.desc": "开启后支持图片识别，并显示视觉模型配置；关闭后图片回到 DSH 原生行为。",
			"upload.title": "上传文件（压缩包/视频）",
			"upload.remove": "移除附件",
			"upload.send": "发送附件",
			"upload.sending": "发送中…",
			"upload.unsupported": "不支持的文件类型：仅支持压缩包（.zip/.7z）和视频",
			"upload.failed": "上传失败，请重试",
			"upload.uploading": "上传中…",
			"upload.message": "上传了文件 {name} → {path}",
			"vision.disabled": "多模态功能未开启：请先在「Look Look 功能」中开启「多模态」。"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"settings.nav": "Vision Models",
			"settings.intro": "Configure the vision model that describes images. Multiple providers are supported: the first is primary, the rest are fallbacks; when the primary fails, recognition degrades to the next provider automatically.",
			"settings.provider.header": "Vision providers",
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
			"settings.provider.removeConfirm": "Remove this provider?",
			"settings.provider.empty": "No vision provider configured yet.",
			"settings.save": "Save",
			"settings.cancel": "Cancel",
			"settings.saved": "Saved",
			"settings.saveFailed": "Save failed",
			"settings.failoverHint": "Order is failover order: the first enabled provider is primary; when it fails, recognition degrades through the rest in order.",
			"eye.on": "Vision assist is on: images are described by the vision model before they reach the conversation model",
			"eye.off": "Vision assist is off: images are sent to the conversation model as-is",
			"eye.unconfigured": "Vision assist is on but no vision model is configured — click to open settings",
			"card.title": "Look Look",
			"card.desc": "Multimodal and file upload support",
			"card.expand": "Expand",
			"card.collapse": "Collapse",
			"features.switches.heading": "Feature switches",
			"features.extensions.label": "More extensions",
			"features.extensions.desc": "When ON, more extensions are accepted (.7z archives, video); when OFF only .zip is accepted.",
			"features.multimodal.label": "Multimodal",
			"features.multimodal.desc": "When ON, image recognition is available and the vision-model configuration is shown; when OFF images fall back to native DSH behavior.",
			"upload.title": "Upload file (archive/video)",
			"upload.remove": "Remove attachment",
			"upload.send": "Send attachment",
			"upload.sending": "Sending…",
			"upload.unsupported": "Unsupported file type: archives (.zip/.7z) and video only",
			"upload.failed": "Upload failed, please retry",
			"upload.uploading": "Uploading…",
			"upload.message": "Uploaded file {name} → {path}",
			"vision.disabled": "Multimodal is disabled: enable it under \"Look Look Features\" first."
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
			const pending = createPendingFilesController();
			const usePending = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(pending.store);
			const sendStore = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({});
			const useSendSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(sendStore);
			const setSendState = (sessionId, next) => {
				sendStore.set({
					...sendStore.getSnapshot(),
					[sessionId]: next
				});
			};
			/** Send every staged file for a session via the reliable prompt path. */
			const sendPending = async (sessionId) => {
				const staged = pending.get(sessionId);
				if (staged.length === 0) return;
				setSendState(sessionId, {
					sending: true,
					error: null
				});
				try {
					const notes = staged.map((f) => {
						return `【looklook:开始】${t("upload.message", {
							name: f.name,
							path: f.path
						})}【looklook:结束】\n【looklook:file】${JSON.stringify({
							name: f.name,
							path: f.path,
							size: f.size
						})}【looklook:file】`;
					}).join("\n");
					const current = sessions.currentProvideInfo.getSnapshot();
					const inputActions = current?.props?.inputActions;
					const inputState = current?.hooks?.input;
					if (inputActions?.setDraft !== void 0 && inputActions?.submit !== void 0) {
						const draft = inputState?.getSnapshot()?.draft ?? "";
						inputActions.setDraft(draft === "" ? notes : `${draft}\n${notes}`);
						inputActions.submit();
						pending.clear(sessionId);
						setSendState(sessionId, {
							sending: false,
							error: null
						});
						return;
					}
					const sent = await connection.api.sessions.prompt({
						sessionId,
						mode: "queue",
						content: [{
							type: "text",
							text: notes
						}]
					});
					if (!sent.result.ok) throw new Error(sent.result.error.message);
					pending.clear(sessionId);
					setSendState(sessionId, {
						sending: false,
						error: null
					});
				} catch (error) {
					setSendState(sessionId, {
						sending: false,
						error: error instanceof Error ? error.message : String(error)
					});
					console.error("looklook sendPending failed:", error);
				}
			};
			const eyes = /* @__PURE__ */ new Map();
			const eyeFor = (sessionId) => {
				let controller = eyes.get(sessionId);
				if (controller === void 0) {
					controller = createEyeController(connection.api, sessionId);
					controller.load();
					eyes.set(sessionId, controller);
				}
				return controller;
			};
			const features = createFeatureController(connection.api);
			features.load();
			const useFeaturesSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(features.store);
			const useMultimodal = () => useFeaturesSnapshot((s) => s.status === "ready" && s.multimodal !== false);
			const useFeatures = () => useFeaturesSnapshot((s) => s);
			/** Current policy for the drop handler (reads the live store, not reactive). */
			const policyAt = () => {
				const state = features.store.getSnapshot();
				return state.status === "ready" && state.moreExtensions !== false ? "extended" : "base";
			};
			ctx.effect(() => {
				const dispose = ctx.remote.$on("settings/document-updated", () => {
					for (const controller of eyes.values()) controller.load();
					features.load();
				});
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
			ctx.effect(() => {
				const mounting = ctx.remote.$mount({
					package: "dsh-looklook",
					descriptors: [{
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
					}]
				});
				return () => {
					mounting.then((dispose) => dispose());
				};
			}, "dsh-looklook: model-discovery remote");
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
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: PLUGIN_CARD_ID,
				order: 30,
				inject: () => ({
					api: connection.api,
					t,
					features,
					useFeatures,
					listModels,
					useMultimodal
				})
			}, LooklookPluginCard));
			ctx.effect(() => {
				const onDragOverCapture = (event) => {
					if (event.dataTransfer?.types.includes("Files") === true) event.preventDefault();
				};
				const onDropCapture = (event) => {
					const files = [...event.dataTransfer?.files ?? []];
					if (files.length === 0) return;
					const policy = policyAt();
					const allowed = (name) => {
						if (policy === "base") return name.toLowerCase().endsWith(".zip");
						return isUploadableName(name);
					};
					if (!files.every((file) => allowed(file.name))) return;
					const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId;
					if (sessionId === void 0 || sessionId === "") return;
					event.preventDefault();
					event.stopPropagation();
					window.dispatchEvent(new DragEvent("dragend"));
					(async () => {
						const staged = (await Promise.all(files.map(async (file) => {
							try {
								const { path } = await uploadFile(sessionId, file);
								return {
									name: file.name,
									path,
									size: file.size
								};
							} catch (error) {
								console.error("looklook upload failed:", file.name, error);
								return null;
							}
						}))).filter((r) => r !== null);
						for (const result of staged) pending.add(sessionId, result);
					})();
				};
				document.addEventListener("dragover", onDragOverCapture, true);
				document.addEventListener("drop", onDropCapture, true);
				return () => {
					document.removeEventListener("dragover", onDragOverCapture, true);
					document.removeEventListener("drop", onDropCapture, true);
				};
			}, "dsh-looklook: archive/video drag-and-drop");
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: PENDING_ID,
				inject: (sessionId) => {
					const state = useSendSnapshot((s) => s[sessionId]);
					return {
						t,
						pending,
						usePending,
						sessionId,
						onSend: () => {
							sendPending(sessionId);
						},
						sending: state?.sending === true,
						sendError: state?.error ?? null
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
						useMultimodal
					};
				}
			}, VisionToggle));
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "user",
				priority: -1,
				locale: NS
			}, LooklookUserMessageNodeView));
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "steering",
				priority: -1,
				locale: NS
			}, LooklookUserMessageNodeView));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map