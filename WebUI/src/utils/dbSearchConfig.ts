export interface DBSearchWarningThresholds {
    totalMatches: number
    perTableMatches: number
}

const DEFAULT_TOTAL_MATCHES_WARN = 300000
const DEFAULT_PER_TABLE_MATCHES_WARN = 100000

function toNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function readLocalStorageNumber(key: string): number | null {
    try {
        const raw = localStorage.getItem(key)
        return raw ? toNumber(raw) : null
    } catch {
        return null
    }
}

function readEnvNumber(key: string): number | null {
    const value = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key]
    return value ? toNumber(value) : null
}

export function getDbSearchWarningThresholds(): DBSearchWarningThresholds {
    const totalMatches =
        readLocalStorageNumber('db_search_warn_total') ??
        readEnvNumber('VITE_DB_SEARCH_WARN_TOTAL') ??
        DEFAULT_TOTAL_MATCHES_WARN

    const perTableMatches =
        readLocalStorageNumber('db_search_warn_table') ??
        readEnvNumber('VITE_DB_SEARCH_WARN_TABLE') ??
        DEFAULT_PER_TABLE_MATCHES_WARN

    return {
        totalMatches: Math.max(0, Math.floor(totalMatches)),
        perTableMatches: Math.max(0, Math.floor(perTableMatches)),
    }
}
