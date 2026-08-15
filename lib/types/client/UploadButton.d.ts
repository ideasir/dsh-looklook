/**
 * UploadButton: the "上传文件" control in the composer tool row
 * (`conversation.input.left`). Accepts archives (.zip/.7z) and video; the
 * bytes go to the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`), then a normal user message is sent with
 * the file path so the model can process it (process_zip / fs / bash).
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** Injected face supplied by the plugin apply closure. */
export interface UploadInjected {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Reactive zip-feature flag (gate the archive button). */
    useZipEnabled: () => boolean;
    /** The current session id (injected by the slot owner). */
    sessionId: string;
}
/** The upload button (rendered in the composer tool row). */
export declare function UploadButton(props: UploadInjected): import("react").JSX.Element;
