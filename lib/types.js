/**
 * Type-level extension points for dsh-looklook.
 *
 * The `prompt/image-admission` and `agent/request-messages` events are the
 * harness extension points this plugin answers (added upstream in
 * deepseek-harness; these local declarations keep the plugin compiling and
 * running against rc.6 releases either way — they merge with the upstream
 * declarations when both exist).
 */
export {};
