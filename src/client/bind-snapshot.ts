/**
 * 内置的 snapshot → React selector hook 桥接。
 *
 * rc.8 起 DSH 不再公开导出 `bindSnapshotSelector`（旧包
 * `@deepseek-ai/dsh-client-web-react` 已改名为 ui-renderer，且不再导出该函数）。
 * 这里按 rc.8 源码的实现原样内置，依赖 `use-sync-external-store`（React 官方
 * 状态桥接库，DSH 客户端也在用），彻底消除对 DSH 内部 API 的耦合。
 */

import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector.js'

/** 一个可订阅的裸快照源（与 DSH 的 HostObservable 契约一致）。 */
export interface HostObservable<T> {
  subscribe(fn: () => void): () => void
  getSnapshot(): T
}

/** 将快照源绑定为 React selector hook 的结果类型。 */
export type SnapshotSelectorHook<T> = <S>(selector: (state: T) => S, equalityFn?: (a: S, b: S) => boolean) => S

/**
 * 把裸 observable 快照源绑定成一个类型化 selector hook。
 * subscribe/getSnapshot 每个源只捕获一次为稳定闭包，组件跨渲染不会重新订阅。
 * 相等性默认 Object.is。
 */
export function bindSnapshotSelector<T>(w: HostObservable<T>): SnapshotSelectorHook<T> {
  const subscribe = (fn: () => void): (() => void) => w.subscribe(fn)
  const getSnapshot = (): T => w.getSnapshot()
  return function useSelector<S>(selector: (s: T) => S, equalityFn?: (a: S, b: S) => boolean): S {
    return useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, selector, equalityFn)
  }
}