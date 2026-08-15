window.__ModuleLoader__.load({
	id: "dsh-looklook",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_ui_attachment = require("@deepseek-ai/dsh-client-ui-attachment");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
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
		//#region src/client/UserMessageNodeView.tsx
		/**
		* LooklookUserMessageNodeView — replaces the default user-message bubble so
		* the chat renders the ORIGINAL image the user sent, even though the session
		* record only carries the plugin's rewritten text (rc.6 rewrites the record).
		*
		* The host embeds a full image-reference JSON in the marker 「【附图:{...}】」
		* and wraps its model-facing tool-reference text in
		* 「【looklook:开始】…【looklook:结束】」 (hidden from the user). This view
		* renders the image with the harness's native ImageGallery (click to enlarge
		* in the lightbox) and shows only the user's own question text. Native image
		* blocks (multimodal models / newer harnesses) render the same way. The
		* component is defensive: unexpected shapes fall back to plain text.
		*/
		/** The host's attachment marker: 「【附图:<ref-json-or-id>】」. */
		const IMAGE_MARKER_RE = /【附图:([^】]+)】/g;
		/** Host hide delimiters: strip everything between them before display. */
		const HIDE_START = "【looklook:开始】";
		const HIDE_END = "【looklook:结束】";
		/** Chinese labels for the native image gallery + lightbox. */
		const IMAGE_LABELS = {
			image: "图片",
			open: "查看原图",
			openNamed: (label) => "查看原图：" + label,
			loading: "加载中…",
			loadFailed: "加载失败，点击重试",
			lightbox: {
				dialog: "图片预览",
				close: "关闭预览"
			}
		};
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
		/**
		* Defensive user-message renderer: renders the image (marker/native) with the
		* native gallery + lightbox, shows only the user's own text; falls back to
		* plain text on unexpected shapes.
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
			for (const raw of content) {
				const block = raw;
				if (block?.type === "text" && typeof block.text === "string") texts.push(stripHidden(block.text));
				else if (block?.type === "image" && typeof block.attachment?.attachmentId === "string") attachments.push(block.attachment);
			}
			const trimmed = texts.join("").replace(IMAGE_MARKER_RE, (_all, payload) => {
				attachments.push(parseMarkerRef(payload));
				return "";
			}).trim();
			if (attachments.length === 0 && trimmed.length === 0) return null;
			const load = props.loadImage ?? (() => Promise.reject(/* @__PURE__ */ new Error("image loader unavailable")));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: 6,
					margin: "8px 0"
				},
				children: [attachments.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_attachment.ImageGallery, {
					images: attachments.map((attachment) => ({ attachment })),
					load,
					align: "end",
					labels: IMAGE_LABELS
				}), trimmed.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						maxWidth: "80%",
						background: "rgba(128,128,128,0.14)",
						padding: "8px 12px",
						borderRadius: 12,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word"
					},
					children: trimmed
				})]
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
						style: layout.card,
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
									style: layout.rowActions,
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
			const { controller, useSnapshot, t } = props;
			const state = useSnapshot((s) => s);
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
			"settings.provider.primary": "主模型",
			"settings.provider.fallback": "备用模型",
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
			"eye.unconfigured": "视觉增强已开启，但未配置视觉模型 → 点击前往设置"
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
			"settings.provider.primary": "Primary",
			"settings.provider.fallback": "Fallback",
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
			"eye.unconfigured": "Vision assist is on but no vision model is configured — click to open settings"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "looklook";
		/** Settings section id and the eye toggle's slot entry id. */
		const SECTION_ID = "looklook";
		const TOGGLE_ID = "looklook-eye";
		/** Required services: slots (registration), locale (copy), connection (wire API), remote (pushed invalidations), sessions (per-session scoping). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"sessions"
		];
		/**
		* Client plugin body: register the settings section and the composer eye
		* toggle. Each session gets its own eye controller (lazy map); pushed
		* settings invalidations refresh every loaded controller.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-looklook: dictionaries");
			const t = ctx.locale.bind(NS);
			const connection = ctx.get("connection");
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
			ctx.effect(() => {
				const dispose = ctx.remote.$on("settings/document-updated", () => {
					for (const controller of eyes.values()) controller.load();
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
			/** Call the host discovery RPC once the namespace is mounted. The remote
			* method resolves to the wire envelope `{ ok, value }` (value is the
			* business result), so unwrap it to the shape the settings page consumes. */
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
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SECTION_ID,
				order: 12,
				label: () => t("settings.nav"),
				inject: () => ({
					api: connection.api,
					t,
					listModels
				})
			}, VisionSettingsSection));
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: TOGGLE_ID,
				inject: (sessionId) => {
					const controller = eyeFor(sessionId);
					return {
						controller,
						useSnapshot: (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(controller.store),
						t
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