import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import type { HTTPErrorInfo } from "@/types";
import { isHTTPEventError } from "@/utils/httpEvent";
import {
    useGlobalSearchStore,
    type SearchResultItem,
    type SearchResultType,
} from "@/stores/globalSearchStore";
import { useHTTPStore } from "@/stores/httpStore";
import { useWSStore } from "@/stores/wsStore";
import { useLogStore } from "@/stores/logStore";
import { useMockStore } from "@/stores/mockStore";
import { useBreakpointStore } from "@/stores/breakpointStore";
import { useChaosStore } from "@/stores/chaosStore";
import type { MockRule, BreakpointRule, ChaosRule } from "@/types";

/**
 * 全局搜索组件
 * 支持 Cmd/Ctrl + K 快捷键唤起
 * 搜索范围：HTTP 请求、WebSocket 会话、日志、Mock 规则、断点规则、故障注入规则、流量规则
 */
export function GlobalSearch() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const {
        isOpen,
        query,
        results,
        selectedIndex,
        recentSearches,
        isSearching,
        open,
        close,
        setQuery,
        selectNext,
        selectPrev,
        getSelectedResult,
        addRecentSearch,
        clearRecentSearches,
    } = useGlobalSearchStore();

    const httpStore = useHTTPStore();
    const wsStore = useWSStore();
    const logStore = useLogStore();
    const mockStore = useMockStore();
    const breakpointStore = useBreakpointStore();
    const chaosStore = useChaosStore();

    // 从 URL 获取当前设备 ID
    const currentDeviceId =
        searchParams.get("deviceId") ||
        window.location.pathname.match(/\/device\/([^/]+)/)?.[1];

    // 打开搜索面板时聚焦输入框
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // 滚动选中项到可见区域
    useEffect(() => {
        if (listRef.current) {
            const selectedEl = listRef.current.querySelector(
                '[data-selected="true"]',
            );
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }
    }, [selectedIndex]);

    // 处理结果选择
    const handleSelect = useCallback(
        (result: SearchResultItem) => {
            addRecentSearch(query);
            close();

            // 根据结果类型执行跳转
            switch (result.type) {
                case "http": {
                    // 选中 HTTP 事件
                    if (currentDeviceId) {
                        httpStore.selectEvent(currentDeviceId, result.id);
                        // 确保在 HTTP 标签页
                        navigate(`/device/${currentDeviceId}?plugin=http`);
                    }
                    break;
                }
                case "websocket": {
                    // 选中 WebSocket 会话
                    if (currentDeviceId) {
                        wsStore.selectSession(currentDeviceId, result.id);
                        navigate(`/device/${currentDeviceId}?plugin=websocket`);
                    }
                    break;
                }
                case "log": {
                    // 选中日志条目
                    logStore.selectEvent(result.id);
                    if (currentDeviceId) {
                        navigate(`/device/${currentDeviceId}?plugin=logs`);
                    }
                    break;
                }
                case "mock": {
                    // 跳转到 Mock 规则面板并打开规则编辑
                    if (currentDeviceId) {
                        const rule = result.raw as MockRule;
                        // 使用 setTimeout 确保导航完成后再打开编辑器
                        setTimeout(() => {
                            mockStore.openEditor(rule);
                        }, 100);
                        navigate(`/device/${currentDeviceId}?plugin=http&subplugin=mock`);
                    }
                    break;
                }
                case "breakpoint": {
                    // 跳转到断点规则面板并打开规则编辑
                    if (currentDeviceId) {
                        const rule = result.raw as BreakpointRule;
                        setTimeout(() => {
                            breakpointStore.openEditor(rule);
                        }, 100);
                        navigate(
                            `/device/${currentDeviceId}?plugin=http&subplugin=breakpoint`,
                        );
                    }
                    break;
                }
                case "chaos": {
                    // 跳转到故障注入规则面板并打开规则编辑
                    if (currentDeviceId) {
                        const rule = result.raw as ChaosRule;
                        setTimeout(() => {
                            chaosStore.openEditor(rule);
                        }, 100);
                        navigate(`/device/${currentDeviceId}?plugin=http&subplugin=chaos`);
                    }
                    break;
                }
                case "trafficRule": {
                    // 跳转到流量规则页面并通过 URL 参数打开编辑
                    navigate(`/rules?editRule=${result.id}`);
                    break;
                }
            }
        },
        [
            query,
            currentDeviceId,
            navigate,
            close,
            addRecentSearch,
            httpStore,
            wsStore,
            logStore,
            mockStore,
            breakpointStore,
            chaosStore,
        ],
    );

    // 键盘事件处理
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    selectNext();
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    selectPrev();
                    break;
                case "Enter": {
                    e.preventDefault();
                    const selected = getSelectedResult();
                    if (selected) {
                        handleSelect(selected);
                    }
                    break;
                }
                case "Escape":
                    e.preventDefault();
                    close();
                    break;
            }
        },
        [selectNext, selectPrev, getSelectedResult, handleSelect, close],
    );

    // 全局快捷键注册
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + K 打开搜索
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                if (isOpen) {
                    close();
                } else {
                    open();
                }
            }
            // Escape 关闭搜索
            if (e.key === "Escape" && isOpen) {
                close();
            }
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [isOpen, open, close]);

    // 计算当前选中项的全局索引
    const getGlobalIndex = (groupIndex: number, itemIndex: number): number => {
        let index = 0;
        for (let i = 0; i < groupIndex; i++) {
            index += results[i].items.length;
        }
        return index + itemIndex;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={close}
            />

            {/* 搜索面板 */}
            <div className="relative w-full max-w-2xl mx-4 bg-bg-dark border border-border rounded-xl shadow-2xl overflow-hidden">
                {/* 搜索输入框 */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <SearchIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜索 HTTP 请求、日志、规则..."
                        className="flex-1 bg-transparent text-text-primary placeholder-text-muted outline-none text-base"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                    {isSearching && (
                        <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                    )}
                    <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-text-muted bg-bg-light rounded">
                        ESC
                    </kbd>
                </div>

                {/* 搜索结果 */}
                <div ref={listRef} className="max-h-[60vh] overflow-auto">
                    {/* 无查询时显示最近搜索 */}
                    {!query && recentSearches.length > 0 && (
                        <div className="p-2">
                            <div className="flex items-center justify-between px-2 py-1">
                                <span className="text-xs text-text-muted font-medium">
                                    最近搜索
                                </span>
                                <button
                                    onClick={clearRecentSearches}
                                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                                >
                                    清除
                                </button>
                            </div>
                            <div className="mt-1">
                                {recentSearches.map((search, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setQuery(search)}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-light text-left transition-colors"
                                    >
                                        <ClockIcon className="w-4 h-4 text-text-muted" />
                                        <span className="text-sm text-text-secondary">
                                            {search}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 无查询且无历史记录 */}
                    {!query && recentSearches.length === 0 && (
                        <div className="px-4 py-8 text-center">
                            <p className="text-text-muted text-sm">
                                输入关键词搜索 HTTP 请求、日志、规则等
                            </p>
                            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-text-muted">
                                <span className="px-2 py-1 bg-bg-light rounded">URL 路径</span>
                                <span className="px-2 py-1 bg-bg-light rounded">HTTP 方法</span>
                                <span className="px-2 py-1 bg-bg-light rounded">状态码</span>
                                <span className="px-2 py-1 bg-bg-light rounded">日志内容</span>
                                <span className="px-2 py-1 bg-bg-light rounded">规则名称</span>
                            </div>
                        </div>
                    )}

                    {/* 有查询但无结果 */}
                    {query && results.length === 0 && !isSearching && (
                        <div className="px-4 py-8 text-center">
                            <p className="text-text-muted text-sm">
                                没有找到匹配 "{query}" 的结果
                            </p>
                        </div>
                    )}

                    {/* 搜索结果列表 */}
                    {results.map((group, groupIndex) => (
                        <div key={group.type} className="p-2">
                            {/* 分组标题 */}
                            <div className="flex items-center gap-2 px-2 py-1.5">
                                <span className="text-base">{group.icon}</span>
                                <span className="text-xs text-text-muted font-medium">
                                    {group.label}
                                </span>
                                <span className="text-xs text-text-muted">({group.total})</span>
                            </div>

                            {/* 分组项目 */}
                            <div className="mt-1">
                                {group.items.map((item, itemIndex) => {
                                    const globalIndex = getGlobalIndex(groupIndex, itemIndex);
                                    const isSelected = globalIndex === selectedIndex;

                                    return (
                                        <button
                                            key={item.id}
                                            data-selected={isSelected}
                                            onClick={() => handleSelect(item)}
                                            className={clsx(
                                                "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                                                isSelected
                                                    ? "bg-accent-primary/20 text-text-primary"
                                                    : "hover:bg-bg-light",
                                            )}
                                        >
                                            {/* 类型图标 */}
                                            <ResultTypeIcon type={item.type} extra={item.extra} />

                                            {/* 内容 */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-text-primary truncate">
                                                    {item.title}
                                                </div>
                                                <div className="text-xs text-text-muted truncate mt-0.5">
                                                    {item.subtitle}
                                                </div>
                                                {item.highlight && (
                                                    <div className="text-xs text-text-tertiary mt-1 truncate">
                                                        <HighlightText
                                                            text={item.highlight}
                                                            query={query}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* 时间戳 */}
                                            {item.timestamp && (
                                                <span className="text-xs text-text-muted flex-shrink-0">
                                                    {formatTime(item.timestamp)}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 底部快捷键提示 */}
                {results.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-text-muted">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                                <kbd className="kbd-sm">↑</kbd>
                                <kbd className="kbd-sm">↓</kbd>
                                选择
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="kbd-sm">↵</kbd>
                                打开
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="kbd-sm">ESC</kbd>
                                关闭
                            </span>
                        </div>
                        <span>
                            共 {results.reduce((sum, g) => sum + g.items.length, 0)} 条结果
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// 搜索图标
function SearchIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
        </svg>
    );
}

// 时钟图标
function ClockIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        </svg>
    );
}

// 结果类型图标
function ResultTypeIcon({
    type,
    extra,
}: {
    type: SearchResultType;
    extra?: Record<string, unknown>;
}) {
    const baseClass =
        "w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0";

    switch (type) {
        case "http": {
            const statusCode = extra?.statusCode as number | undefined;
            const error = extra?.error as HTTPErrorInfo | undefined;
            const errorDescription = extra?.errorDescription as string | undefined;
            const isError = isHTTPEventError(
                statusCode ?? null,
                error ?? null,
                errorDescription ?? null
            );
            const bgColor = isError
                ? "bg-red-500/20"
                : statusCode && statusCode >= 300
                    ? "bg-yellow-500/20"
                    : "bg-green-500/20";
            return <span className={clsx(baseClass, bgColor)}>🌐</span>;
        }
        case "websocket": {
            const isOpen = extra?.isOpen as boolean | undefined;
            return (
                <span
                    className={clsx(
                        baseClass,
                        isOpen ? "bg-green-500/20" : "bg-gray-500/20",
                    )}
                >
                    🔌
                </span>
            );
        }
        case "log": {
            const level = extra?.level as string | undefined;
            const bgMap: Record<string, string> = {
                error: "bg-red-500/20",
                warning: "bg-yellow-500/20",
                info: "bg-blue-500/20",
                debug: "bg-gray-500/20",
                verbose: "bg-gray-500/10",
            };
            return (
                <span
                    className={clsx(
                        baseClass,
                        bgMap[level || "info"] || "bg-gray-500/20",
                    )}
                >
                    📝
                </span>
            );
        }
        case "mock":
            return <span className={clsx(baseClass, "bg-purple-500/20")}>🎭</span>;
        case "breakpoint":
            return <span className={clsx(baseClass, "bg-red-500/20")}>🔴</span>;
        case "chaos":
            return <span className={clsx(baseClass, "bg-orange-500/20")}>💥</span>;
        case "trafficRule":
            return <span className={clsx(baseClass, "bg-cyan-500/20")}>🚦</span>;
        default:
            return <span className={clsx(baseClass, "bg-gray-500/20")}>📄</span>;
    }
}

// 高亮匹配文本
function HighlightText({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return <>{text}</>;

    return (
        <>
            {text.slice(0, index)}
            <span className="text-accent-primary font-medium">
                {text.slice(index, index + query.length)}
            </span>
            {text.slice(index + query.length)}
        </>
    );
}

// 格式化时间
function formatTime(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        // 小于 1 分钟
        if (diff < 60000) {
            return "刚刚";
        }
        // 小于 1 小时
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)} 分钟前`;
        }
        // 小于 24 小时
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)} 小时前`;
        }
        // 超过 24 小时，显示日期
        return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    } catch {
        return "";
    }
}
