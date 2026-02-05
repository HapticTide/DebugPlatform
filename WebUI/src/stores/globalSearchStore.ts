import { create } from "zustand";
import { useHTTPStore } from "./httpStore";
import { useWSStore } from "./wsStore";
import { useLogStore } from "./logStore";
import { useMockStore } from "./mockStore";
import { useBreakpointStore } from "./breakpointStore";
import { useChaosStore } from "./chaosStore";
import { useRuleStore } from "./ruleStore";

// 搜索结果类型
export type SearchResultType =
    | "http"
    | "websocket"
    | "wsFrame"
    | "log"
    | "mock"
    | "breakpoint"
    | "chaos"
    | "trafficRule";

// 单个搜索结果项
export interface SearchResultItem {
    id: string;
    type: SearchResultType;
    title: string;
    subtitle: string;
    highlight?: string; // 匹配高亮的文本
    timestamp?: string;
    extra?: Record<string, unknown>;
    // 原始数据引用（用于跳转）
    raw: unknown;
}

// 分组搜索结果
export interface SearchResultGroup {
    type: SearchResultType;
    label: string;
    icon: string;
    items: SearchResultItem[];
    total: number;
}

interface GlobalSearchState {
    // 状态
    isOpen: boolean;
    query: string;
    isSearching: boolean;
    results: SearchResultGroup[];
    selectedIndex: number; // 当前选中的结果索引
    recentSearches: string[];

    // 操作
    open: () => void;
    close: () => void;
    setQuery: (query: string) => void;
    search: (query: string, deviceId?: string) => void;
    selectNext: () => void;
    selectPrev: () => void;
    getSelectedResult: () => SearchResultItem | null;
    addRecentSearch: (query: string) => void;
    clearRecentSearches: () => void;
}

// 类型标签映射
const TYPE_LABELS: Record<SearchResultType, { label: string; icon: string }> = {
    http: { label: "HTTP 请求", icon: "🌐" },
    websocket: { label: "WebSocket 会话", icon: "🔌" },
    wsFrame: { label: "WebSocket 帧", icon: "📨" },
    log: { label: "日志", icon: "📝" },
    mock: { label: "Mock 规则", icon: "🎭" },
    breakpoint: { label: "断点规则", icon: "🔴" },
    chaos: { label: "故障注入规则", icon: "💥" },
    trafficRule: { label: "流量规则", icon: "🚦" },
};

// 搜索 HTTP 事件
function searchHTTPEvents(query: string, maxResults = 10): SearchResultItem[] {
    const events = useHTTPStore.getState().events;
    const lowerQuery = query.toLowerCase();

    return events
        .filter((event) => {
            return (
                event.url.toLowerCase().includes(lowerQuery) ||
                event.method.toLowerCase().includes(lowerQuery) ||
                (event.statusCode?.toString() || "").includes(query) ||
                (event.traceId?.toLowerCase() || "").includes(lowerQuery)
            );
        })
        .slice(0, maxResults)
        .map((event) => ({
            id: event.id,
            type: "http" as const,
            title: `${event.method} ${extractPath(event.url)}`,
            subtitle: extractDomain(event.url),
            highlight: findHighlight(event.url, query),
            timestamp: event.startTime,
            extra: {
                statusCode: event.statusCode,
                isMocked: event.isMocked,
                error: event.error,
                errorDescription: event.errorDescription,
            },
            raw: event,
        }));
}

// 搜索 WebSocket 会话
function searchWSSessions(query: string, maxResults = 10): SearchResultItem[] {
    const sessions = useWSStore.getState().sessions;
    const lowerQuery = query.toLowerCase();

    return sessions
        .filter((session) => {
            return (
                session.url.toLowerCase().includes(lowerQuery) ||
                session.id.toLowerCase().includes(lowerQuery)
            );
        })
        .slice(0, maxResults)
        .map((session) => ({
            id: session.id,
            type: "websocket" as const,
            title: extractPath(session.url) || session.url,
            subtitle: `${session.isOpen ? "🟢 连接中" : "🔴 已断开"} · ${extractDomain(session.url)}`,
            highlight: findHighlight(session.url, query),
            timestamp: session.connectTime,
            extra: {
                isOpen: session.isOpen,
                closeCode: session.closeCode,
            },
            raw: session,
        }));
}

// 搜索日志事件
function searchLogEvents(query: string, maxResults = 15): SearchResultItem[] {
    const events = useLogStore.getState().events;
    const lowerQuery = query.toLowerCase();

    return events
        .filter((event) => {
            return (
                event.message.toLowerCase().includes(lowerQuery) ||
                (event.subsystem?.toLowerCase() || "").includes(lowerQuery) ||
                (event.category?.toLowerCase() || "").includes(lowerQuery) ||
                (event.traceId?.toLowerCase() || "").includes(lowerQuery) ||
                event.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
            );
        })
        .slice(0, maxResults)
        .map((event) => ({
            id: event.id,
            type: "log" as const,
            title: truncateText(event.message, 80),
            subtitle: `${getLevelEmoji(event.level)} ${event.level.toUpperCase()}${event.subsystem ? ` · ${event.subsystem}` : ""}${event.category ? ` / ${event.category}` : ""}`,
            highlight: findHighlight(event.message, query),
            timestamp: event.timestamp,
            extra: {
                level: event.level,
                subsystem: event.subsystem,
                category: event.category,
            },
            raw: event,
        }));
}

// 搜索 Mock 规则
function searchMockRules(query: string, maxResults = 10): SearchResultItem[] {
    const rules = useMockStore.getState().rules;
    const lowerQuery = query.toLowerCase();

    return rules
        .filter((rule) => {
            return (
                rule.name.toLowerCase().includes(lowerQuery) ||
                (rule.condition.urlPattern?.toLowerCase() || "").includes(lowerQuery) ||
                (rule.condition.method?.toLowerCase() || "").includes(lowerQuery) ||
                rule.targetType.toLowerCase().includes(lowerQuery)
            );
        })
        .slice(0, maxResults)
        .map((rule) => ({
            id: rule.id,
            type: "mock" as const,
            title: rule.name,
            subtitle: `${rule.enabled ? "✅" : "❌"} ${rule.targetType} · ${rule.condition.urlPattern || "任意 URL"}`,
            highlight: findHighlight(
                rule.name + " " + (rule.condition.urlPattern || ""),
                query,
            ),
            timestamp: rule.createdAt || undefined,
            extra: {
                enabled: rule.enabled,
                targetType: rule.targetType,
            },
            raw: rule,
        }));
}

// 搜索断点规则
function searchBreakpointRules(
    query: string,
    maxResults = 10,
): SearchResultItem[] {
    const rules = useBreakpointStore.getState().rules;
    const lowerQuery = query.toLowerCase();

    return rules
        .filter((rule) => {
            return (
                rule.name.toLowerCase().includes(lowerQuery) ||
                (rule.urlPattern?.toLowerCase() || "").includes(lowerQuery) ||
                (rule.method?.toLowerCase() || "").includes(lowerQuery) ||
                rule.phase.toLowerCase().includes(lowerQuery)
            );
        })
        .slice(0, maxResults)
        .map((rule) => ({
            id: rule.id,
            type: "breakpoint" as const,
            title: rule.name,
            subtitle: `${rule.enabled ? "✅" : "❌"} ${rule.phase} · ${rule.urlPattern || "任意 URL"}`,
            highlight: findHighlight(
                rule.name + " " + (rule.urlPattern || ""),
                query,
            ),
            timestamp: rule.createdAt || undefined,
            extra: {
                enabled: rule.enabled,
                phase: rule.phase,
            },
            raw: rule,
        }));
}

// 搜索故障注入规则
function searchChaosRules(query: string, maxResults = 10): SearchResultItem[] {
    const rules = useChaosStore.getState().rules;
    const lowerQuery = query.toLowerCase();

    return rules
        .filter((rule) => {
            return (
                rule.name.toLowerCase().includes(lowerQuery) ||
                (rule.urlPattern?.toLowerCase() || "").includes(lowerQuery) ||
                (rule.method?.toLowerCase() || "").includes(lowerQuery) ||
                rule.chaos.type.toLowerCase().includes(lowerQuery)
            );
        })
        .slice(0, maxResults)
        .map((rule) => ({
            id: rule.id,
            type: "chaos" as const,
            title: rule.name,
            subtitle: `${rule.enabled ? "✅" : "❌"} ${getChaosTypeLabel(rule.chaos.type)} · ${Math.round(rule.probability * 100)}%`,
            highlight: findHighlight(
                rule.name + " " + (rule.urlPattern || ""),
                query,
            ),
            timestamp: rule.createdAt || undefined,
            extra: {
                enabled: rule.enabled,
                chaosType: rule.chaos.type,
                probability: rule.probability,
            },
            raw: rule,
        }));
}

// 搜索流量规则
function searchTrafficRules(
    query: string,
    maxResults = 10,
): SearchResultItem[] {
    const rules =
        useRuleStore.getState().deviceRules.length > 0
            ? useRuleStore.getState().deviceRules
            : useRuleStore.getState().rules;
    const lowerQuery = query.toLowerCase();

    return rules
        .filter((rule) => {
            return (
                rule.name.toLowerCase().includes(lowerQuery) ||
                rule.matchValue.toLowerCase().includes(lowerQuery) ||
                rule.matchType.toLowerCase().includes(lowerQuery) ||
                rule.action.toLowerCase().includes(lowerQuery)
            );
        })
        .slice(0, maxResults)
        .map((rule) => ({
            id: rule.id,
            type: "trafficRule" as const,
            title: rule.name,
            subtitle: `${rule.isEnabled ? "✅" : "❌"} ${rule.matchType}: ${rule.matchValue} → ${rule.action}`,
            highlight: findHighlight(rule.name + " " + rule.matchValue, query),
            timestamp: rule.createdAt || undefined,
            extra: {
                isEnabled: rule.isEnabled,
                matchType: rule.matchType,
                action: rule.action,
            },
            raw: rule,
        }));
}

// 辅助函数：提取域名
function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

// 辅助函数：提取路径
function extractPath(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname + urlObj.search;
    } catch {
        return url;
    }
}

// 辅助函数：截断文本
function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
}

// 辅助函数：查找高亮文本
function findHighlight(text: string, query: string): string | undefined {
    if (!query) return undefined;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return undefined;

    const start = Math.max(0, index - 20);
    const end = Math.min(text.length, index + query.length + 20);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";
    return prefix + text.slice(start, end) + suffix;
}

// 辅助函数：日志级别 Emoji
function getLevelEmoji(level: string): string {
    switch (level) {
        case "error":
            return "🔴";
        case "warning":
            return "🟡";
        case "info":
            return "🔵";
        case "debug":
            return "⚪";
        case "verbose":
            return "⬜";
        default:
            return "⚪";
    }
}

// 辅助函数：故障类型标签
function getChaosTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        latency: "延迟",
        timeout: "超时",
        connectionReset: "连接重置",
        randomError: "随机错误",
        corruptResponse: "响应损坏",
        slowNetwork: "慢速网络",
        dropRequest: "丢弃请求",
    };
    return labels[type] || type;
}

// 从 localStorage 加载最近搜索
function loadRecentSearches(): string[] {
    try {
        const saved = localStorage.getItem("globalSearch.recentSearches");
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

// 保存最近搜索到 localStorage
function saveRecentSearches(searches: string[]) {
    try {
        localStorage.setItem(
            "globalSearch.recentSearches",
            JSON.stringify(searches),
        );
    } catch {
        // ignore
    }
}

export const useGlobalSearchStore = create<GlobalSearchState>((set, get) => ({
    isOpen: false,
    query: "",
    isSearching: false,
    results: [],
    selectedIndex: 0,
    recentSearches: loadRecentSearches(),

    open: () => set({ isOpen: true, query: "", results: [], selectedIndex: 0 }),

    close: () => set({ isOpen: false, query: "", results: [], selectedIndex: 0 }),

    setQuery: (query) => {
        set({ query });
        // 当输入变化时执行搜索
        if (query.trim().length >= 1) {
            get().search(query);
        } else {
            set({ results: [], selectedIndex: 0 });
        }
    },

    search: (query) => {
        if (!query.trim()) {
            set({ results: [], selectedIndex: 0 });
            return;
        }

        set({ isSearching: true });

        // 执行各模块搜索
        const httpResults = searchHTTPEvents(query);
        const wsResults = searchWSSessions(query);
        const logResults = searchLogEvents(query);
        const mockResults = searchMockRules(query);
        const breakpointResults = searchBreakpointRules(query);
        const chaosResults = searchChaosRules(query);
        const trafficRuleResults = searchTrafficRules(query);

        // 组装分组结果
        const groups: SearchResultGroup[] = [];

        if (httpResults.length > 0) {
            groups.push({
                type: "http",
                ...TYPE_LABELS.http,
                items: httpResults,
                total: httpResults.length,
            });
        }

        if (wsResults.length > 0) {
            groups.push({
                type: "websocket",
                ...TYPE_LABELS.websocket,
                items: wsResults,
                total: wsResults.length,
            });
        }

        if (logResults.length > 0) {
            groups.push({
                type: "log",
                ...TYPE_LABELS.log,
                items: logResults,
                total: logResults.length,
            });
        }

        if (mockResults.length > 0) {
            groups.push({
                type: "mock",
                ...TYPE_LABELS.mock,
                items: mockResults,
                total: mockResults.length,
            });
        }

        if (breakpointResults.length > 0) {
            groups.push({
                type: "breakpoint",
                ...TYPE_LABELS.breakpoint,
                items: breakpointResults,
                total: breakpointResults.length,
            });
        }

        if (chaosResults.length > 0) {
            groups.push({
                type: "chaos",
                ...TYPE_LABELS.chaos,
                items: chaosResults,
                total: chaosResults.length,
            });
        }

        if (trafficRuleResults.length > 0) {
            groups.push({
                type: "trafficRule",
                ...TYPE_LABELS.trafficRule,
                items: trafficRuleResults,
                total: trafficRuleResults.length,
            });
        }

        set({ results: groups, isSearching: false, selectedIndex: 0 });
    },

    selectNext: () => {
        const { results, selectedIndex } = get();
        const totalItems = results.reduce((sum, g) => sum + g.items.length, 0);
        if (totalItems === 0) return;
        set({ selectedIndex: (selectedIndex + 1) % totalItems });
    },

    selectPrev: () => {
        const { results, selectedIndex } = get();
        const totalItems = results.reduce((sum, g) => sum + g.items.length, 0);
        if (totalItems === 0) return;
        set({ selectedIndex: (selectedIndex - 1 + totalItems) % totalItems });
    },

    getSelectedResult: () => {
        const { results, selectedIndex } = get();
        let currentIndex = 0;
        for (const group of results) {
            for (const item of group.items) {
                if (currentIndex === selectedIndex) {
                    return item;
                }
                currentIndex++;
            }
        }
        return null;
    },

    addRecentSearch: (query) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        const { recentSearches } = get();
        const filtered = recentSearches.filter((s) => s !== trimmed);
        const updated = [trimmed, ...filtered].slice(0, 10);
        set({ recentSearches: updated });
        saveRecentSearches(updated);
    },

    clearRecentSearches: () => {
        set({ recentSearches: [] });
        saveRecentSearches([]);
    },
}));
