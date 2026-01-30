# Android DebugProbe 开发指南

本文档为开发 Android 版 DebugProbe SDK 提供架构设计和实现指南，以便与现有的 Debug Platform 生态系统无缝集成。

> **最后更新**: 2025-12-12

---

## 📋 概述

Android DebugProbe 是 Debug Platform 的 Android 端 SDK，用于捕获和上报 App 的网络请求、日志、数据库等调试信息到 Debug Hub。

### 设计目标

1. **与 iOS SDK 功能对等** - 实现相同的核心功能模块
2. **与 Debug Hub 协议兼容** - 使用相同的 WebSocket 消息格式
3. **最小侵入性** - 不影响 App 正常运行，仅在调试模式下生效
4. **插件化架构** - 与 iOS 版保持一致的插件系统设计

---

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Android DebugProbe SDK                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐      │
│  │  HttpPlugin   │   │   LogPlugin   │   │WebSocketPlugin│      │
│  │ (OkHttp 拦截) │   │  (Timber/Log) │   │  (WS 监控)    │      │
│  └───────┬───────┘   └───────┬───────┘   └───────┬───────┘      │
│          │                   │                   │               │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐      │
│  │  MockPlugin   │   │BreakpointPlugin│  │  ChaosPlugin  │      │
│  │  (Mock 规则)   │   │  (断点调试)    │   │  (故障注入)   │      │
│  └───────┬───────┘   └───────┬───────┘   └───────┬───────┘      │
│          │                   │                   │               │
│          ▼                   ▼                   ▼               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    PluginManager                           │  │
│  │  • 插件生命周期管理（注册/启动/停止）                       │  │
│  │  • 事件路由（捕获层 → 插件层 → BridgeClient）              │  │
│  │  • 命令分发（服务端命令 → 目标插件）                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│          │                                                       │
│          ▼                                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    DebugBridgeClient                       │  │
│  │  • WebSocket 连接管理                                       │  │
│  │  • 事件缓冲和批量发送                                       │  │
│  │  • 断线重连和持久化恢复                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                    │                             │
└────────────────────────────────────┼─────────────────────────────┘
                                     │ WebSocket
                                     ▼
                              ┌─────────────┐
                              │ Debug Hub   │
                              │  (服务端)    │
                              └─────────────┘
```

### 模块结构

```
android-debugprobe/
├── debugprobe/                          # 核心库模块
│   ├── src/main/kotlin/com/debugprobe/
│   │   ├── DebugProbe.kt                # 主入口单例
│   │   ├── DebugProbeSettings.kt        # 配置管理
│   │   ├── core/
│   │   │   ├── DebugBridgeClient.kt     # WebSocket 通信
│   │   │   ├── EventPersistenceQueue.kt # 事件持久化（Room）
│   │   │   └── plugin/
│   │   │       ├── PluginManager.kt     # 插件管理器
│   │   │       ├── PluginProtocol.kt    # 插件协议定义
│   │   │       └── EventCallbacks.kt    # 事件回调中心
│   │   ├── plugins/
│   │   │   ├── HttpPlugin.kt            # HTTP 捕获插件
│   │   │   ├── LogPlugin.kt             # 日志捕获插件
│   │   │   ├── WebSocketPlugin.kt       # WebSocket 监控插件
│   │   │   ├── DatabasePlugin.kt        # SQLite 检查插件
│   │   │   ├── MockPlugin.kt            # Mock 规则插件
│   │   │   ├── BreakpointPlugin.kt      # 断点调试插件
│   │   │   ├── ChaosPlugin.kt           # 故障注入插件
│   │   │   └── PerformancePlugin.kt     # 性能监控插件
│   │   ├── network/
│   │   │   ├── DebugProbeInterceptor.kt # OkHttp 拦截器
│   │   │   └── WebSocketMonitor.kt      # WebSocket 监控
│   │   ├── database/
│   │   │   ├── DatabaseRegistry.kt      # 数据库注册
│   │   │   └── SQLiteInspector.kt       # SQLite 检查器
│   │   └── models/
│   │       ├── BridgeMessage.kt         # 消息模型
│   │       ├── DebugEvent.kt            # 事件模型
│   │       ├── DeviceInfo.kt            # 设备信息
│   │       ├── MockRule.kt              # Mock 规则
│   │       ├── BreakpointRule.kt        # 断点规则
│   │       └── ChaosRule.kt             # Chaos 规则
│   └── build.gradle.kts
├── debugprobe-timber/                   # Timber 集成模块（可选）
│   └── src/main/kotlin/
│       └── TimberDebugTree.kt
├── debugprobe-okhttp/                   # OkHttp 拦截器模块
│   └── src/main/kotlin/
│       └── OkHttpInterceptor.kt
├── demo/                                # 演示应用
│   └── src/main/kotlin/
│       └── DemoActivity.kt
└── build.gradle.kts
```

---

## 🔌 插件系统设计

### 插件协议

```kotlin
/**
 * 插件唯一标识
 */
object BuiltinPluginId {
    const val HTTP = "http"
    const val LOG = "log"
    const val DATABASE = "database"
    const val WEBSOCKET = "websocket"
    const val MOCK = "mock"
    const val BREAKPOINT = "breakpoint"
    const val CHAOS = "chaos"
    const val PERFORMANCE = "performance"
}

/**
 * 插件状态
 */
enum class PluginState {
    UNINITIALIZED,
    STARTING,
    RUNNING,
    PAUSED,
    STOPPING,
    STOPPED,
    ERROR
}

/**
 * 插件协议
 */
interface DebugProbePlugin {
    /** 插件唯一 ID */
    val pluginId: String
    
    /** 插件显示名称 */
    val displayName: String
    
    /** 插件版本 */
    val version: String
    
    /** 插件描述 */
    val description: String
    
    /** 依赖的其他插件 ID */
    val dependencies: List<String>
        get() = emptyList()
    
    /** 当前状态 */
    val state: PluginState
    
    /** 是否已启用 */
    val isEnabled: Boolean
    
    /** 初始化插件 */
    fun initialize(context: PluginContext)
    
    /** 启动插件 */
    suspend fun start()
    
    /** 暂停插件 */
    suspend fun pause() {}
    
    /** 恢复插件 */
    suspend fun resume() {}
    
    /** 停止插件 */
    suspend fun stop()
    
    /** 处理来自服务端的命令 */
    suspend fun handleCommand(command: PluginCommand)
}
```

### 插件上下文

```kotlin
/**
 * 插件运行上下文
 */
interface PluginContext {
    /** 设备 ID */
    val deviceId: String
    
    /** 设备信息 */
    val deviceInfo: DeviceInfo
    
    /** Application Context */
    val applicationContext: Context
    
    /** 发送插件事件 */
    fun sendEvent(event: PluginEvent)
    
    /** 发送命令响应 */
    fun sendCommandResponse(response: PluginCommandResponse)
    
    /** 获取插件配置 */
    fun <T> getConfiguration(key: String, clazz: Class<T>): T?
    
    /** 存储插件配置 */
    fun setConfiguration(key: String, value: Any)
}
```

---

## 🌐 HTTP 捕获实现

### OkHttp 拦截器

```kotlin
/**
 * DebugProbe OkHttp 拦截器
 * 
 * 使用方式：
 * ```kotlin
 * val client = OkHttpClient.Builder()
 *     .addInterceptor(DebugProbeInterceptor())
 *     .build()
 * ```
 */
class DebugProbeInterceptor : Interceptor {
    
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val requestId = UUID.randomUUID().toString()
        val startTime = System.currentTimeMillis()
        
        // 记录请求
        val httpEvent = HttpEvent(
            id = requestId,
            url = request.url.toString(),
            method = request.method,
            requestHeaders = request.headers.toMap(),
            requestBody = request.body?.let { readBody(it) },
            startTime = startTime
        )
        
        // Mock 规则检查
        val mockResponse = MockPlugin.instance?.matchRule(request)
        if (mockResponse != null) {
            httpEvent.apply {
                statusCode = mockResponse.statusCode
                responseHeaders = mockResponse.headers
                responseBody = mockResponse.body
                endTime = System.currentTimeMillis()
                isMocked = true
            }
            EventCallbacks.reportEvent(DebugEvent.Http(httpEvent))
            return mockResponse.toOkHttpResponse(request)
        }
        
        // 断点检查
        val breakpointResult = BreakpointPlugin.instance?.checkBreakpoint(request)
        val finalRequest = breakpointResult?.modifiedRequest ?: request
        
        // Chaos 故障注入
        ChaosPlugin.instance?.applyFault(request)?.let { fault ->
            when (fault) {
                is ChaosFault.Delay -> Thread.sleep(fault.delayMs)
                is ChaosFault.Error -> {
                    httpEvent.apply {
                        statusCode = fault.statusCode
                        endTime = System.currentTimeMillis()
                        error = "Chaos injected error"
                    }
                    EventCallbacks.reportEvent(DebugEvent.Http(httpEvent))
                    return Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(fault.statusCode)
                        .message("Chaos Error")
                        .body("".toResponseBody())
                        .build()
                }
                // ... 其他故障类型
            }
        }
        
        return try {
            val response = chain.proceed(finalRequest)
            
            httpEvent.apply {
                statusCode = response.code
                responseHeaders = response.headers.toMap()
                responseBody = response.peekBody(MAX_BODY_SIZE).string()
                endTime = System.currentTimeMillis()
            }
            
            EventCallbacks.reportEvent(DebugEvent.Http(httpEvent))
            response
        } catch (e: Exception) {
            httpEvent.apply {
                error = e.message
                endTime = System.currentTimeMillis()
            }
            EventCallbacks.reportEvent(DebugEvent.Http(httpEvent))
            throw e
        }
    }
    
    companion object {
        private const val MAX_BODY_SIZE = 1024 * 1024L // 1MB
    }
}
```

### Retrofit 集成

```kotlin
/**
 * Retrofit 快速集成
 */
object DebugProbeRetrofit {
    
    fun createClient(baseClient: OkHttpClient? = null): OkHttpClient {
        val builder = baseClient?.newBuilder() ?: OkHttpClient.Builder()
        
        if (BuildConfig.DEBUG) {
            builder.addInterceptor(DebugProbeInterceptor())
        }
        
        return builder.build()
    }
}

// 使用示例
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.example.com")
    .client(DebugProbeRetrofit.createClient())
    .addConverterFactory(GsonConverterFactory.create())
    .build()
```

---

## 📋 日志捕获实现

### Timber 集成

```kotlin
/**
 * Timber 日志桥接
 * 
 * 使用方式：
 * ```kotlin
 * if (BuildConfig.DEBUG) {
 *     Timber.plant(DebugProbeTree())
 * }
 * ```
 */
class DebugProbeTree : Timber.Tree() {
    
    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val level = when (priority) {
            Log.VERBOSE -> LogLevel.VERBOSE
            Log.DEBUG -> LogLevel.DEBUG
            Log.INFO -> LogLevel.INFO
            Log.WARN -> LogLevel.WARNING
            Log.ERROR, Log.ASSERT -> LogLevel.ERROR
            else -> LogLevel.DEBUG
        }
        
        val logEvent = LogEvent(
            id = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            level = level,
            tag = tag,
            message = message,
            throwable = t?.stackTraceToString(),
            thread = Thread.currentThread().name
        )
        
        EventCallbacks.reportEvent(DebugEvent.Log(logEvent))
    }
}
```

### 标准 Log 代理

```kotlin
/**
 * Android Log 代理
 * 
 * 替换标准 Log 调用以捕获日志
 */
object DebugLog {
    
    fun v(tag: String, msg: String): Int {
        capture(LogLevel.VERBOSE, tag, msg)
        return Log.v(tag, msg)
    }
    
    fun d(tag: String, msg: String): Int {
        capture(LogLevel.DEBUG, tag, msg)
        return Log.d(tag, msg)
    }
    
    fun i(tag: String, msg: String): Int {
        capture(LogLevel.INFO, tag, msg)
        return Log.i(tag, msg)
    }
    
    fun w(tag: String, msg: String): Int {
        capture(LogLevel.WARNING, tag, msg)
        return Log.w(tag, msg)
    }
    
    fun e(tag: String, msg: String, tr: Throwable? = null): Int {
        capture(LogLevel.ERROR, tag, msg, tr)
        return if (tr != null) Log.e(tag, msg, tr) else Log.e(tag, msg)
    }
    
    private fun capture(level: LogLevel, tag: String, msg: String, tr: Throwable? = null) {
        if (!DebugProbe.isStarted) return
        
        val event = LogEvent(
            id = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            level = level,
            tag = tag,
            message = msg,
            throwable = tr?.stackTraceToString(),
            thread = Thread.currentThread().name
        )
        
        EventCallbacks.reportEvent(DebugEvent.Log(event))
    }
}
```

---

## 🗄️ 数据库检查实现

### 数据库注册

```kotlin
/**
 * 数据库注册中心
 */
object DatabaseRegistry {
    
    private val databases = mutableMapOf<String, DatabaseDescriptor>()
    
    /**
     * 注册数据库
     */
    fun register(
        id: String,
        name: String,
        path: String,
        kind: String = "main",
        isSensitive: Boolean = false
    ) {
        databases[id] = DatabaseDescriptor(
            id = id,
            name = name,
            path = path,
            kind = kind,
            isSensitive = isSensitive
        )
    }
    
    /**
     * 注册 Room 数据库
     */
    fun registerRoom(database: RoomDatabase, name: String, id: String = name) {
        val path = database.openHelper.writableDatabase.path ?: return
        register(id, name, path)
    }
    
    /**
     * 自动发现目录下的数据库
     */
    fun autoDiscover(context: Context) {
        val dbDir = context.getDatabasePath("dummy").parentFile ?: return
        dbDir.listFiles { file -> file.extension == "db" }?.forEach { file ->
            register(
                id = file.nameWithoutExtension,
                name = file.nameWithoutExtension,
                path = file.absolutePath
            )
        }
    }
    
    fun getAll(): List<DatabaseDescriptor> = databases.values.toList()
    
    fun get(id: String): DatabaseDescriptor? = databases[id]
}
```

### SQLite 检查器

```kotlin
/**
 * SQLite 数据库检查器
 */
class SQLiteInspector(private val context: Context) {
    
    /**
     * 获取数据库中的所有表
     */
    suspend fun getTables(dbPath: String): List<TableInfo> = withContext(Dispatchers.IO) {
        val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
        try {
            val tables = mutableListOf<TableInfo>()
            val cursor = db.rawQuery(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                null
            )
            cursor.use {
                while (it.moveToNext()) {
                    val tableName = it.getString(0)
                    val rowCount = getTableRowCount(db, tableName)
                    tables.add(TableInfo(name = tableName, rowCount = rowCount))
                }
            }
            tables
        } finally {
            db.close()
        }
    }
    
    /**
     * 查询表数据
     */
    suspend fun queryTable(
        dbPath: String,
        tableName: String,
        limit: Int = 100,
        offset: Int = 0,
        orderBy: String? = null,
        orderDesc: Boolean = false
    ): TableData = withContext(Dispatchers.IO) {
        val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
        try {
            val orderClause = orderBy?.let { "ORDER BY $it ${if (orderDesc) "DESC" else "ASC"}" } ?: ""
            val cursor = db.rawQuery(
                "SELECT * FROM $tableName $orderClause LIMIT $limit OFFSET $offset",
                null
            )
            cursor.use {
                val columns = cursor.columnNames.toList()
                val rows = mutableListOf<List<Any?>>()
                while (cursor.moveToNext()) {
                    val row = columns.mapIndexed { index, _ ->
                        when (cursor.getType(index)) {
                            Cursor.FIELD_TYPE_NULL -> null
                            Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(index)
                            Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(index)
                            Cursor.FIELD_TYPE_BLOB -> cursor.getBlob(index)
                            else -> cursor.getString(index)
                        }
                    }
                    rows.add(row)
                }
                TableData(columns = columns, rows = rows)
            }
        } finally {
            db.close()
        }
    }
    
    /**
     * 执行自定义 SQL 查询（仅 SELECT）
     */
    suspend fun executeQuery(dbPath: String, query: String): QueryResult = withContext(Dispatchers.IO) {
        // 安全检查：只允许 SELECT
        require(query.trim().uppercase().startsWith("SELECT")) {
            "Only SELECT statements are allowed"
        }
        
        val db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)
        try {
            val startTime = System.currentTimeMillis()
            val cursor = db.rawQuery(query, null)
            cursor.use {
                val columns = cursor.columnNames.toList()
                val rows = mutableListOf<List<Any?>>()
                var count = 0
                while (cursor.moveToNext() && count < MAX_QUERY_ROWS) {
                    val row = columns.mapIndexed { index, _ ->
                        when (cursor.getType(index)) {
                            Cursor.FIELD_TYPE_NULL -> null
                            Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(index)
                            Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(index)
                            Cursor.FIELD_TYPE_BLOB -> "[BLOB: ${cursor.getBlob(index).size} bytes]"
                            else -> cursor.getString(index)
                        }
                    }
                    rows.add(row)
                    count++
                }
                QueryResult(
                    columns = columns,
                    rows = rows,
                    executionTimeMs = System.currentTimeMillis() - startTime,
                    truncated = count >= MAX_QUERY_ROWS
                )
            }
        } finally {
            db.close()
        }
    }
    
    companion object {
        private const val MAX_QUERY_ROWS = 1000
    }
}
```

---

## 🔧 WebSocket 通信

### DebugBridgeClient

```kotlin
/**
 * Debug Hub WebSocket 客户端
 */
class DebugBridgeClient(
    private val settings: DebugProbeSettings
) {
    
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()
    
    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val state: StateFlow<ConnectionState> = _state.asStateFlow()
    
    private val eventBuffer = ArrayDeque<DebugEvent>(MAX_BUFFER_SIZE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    /**
     * 连接到 Debug Hub
     */
    fun connect() {
        val url = settings.hubURL
        val request = Request.Builder()
            .url(url)
            .apply {
                settings.token?.let { header("Authorization", "Bearer $it") }
            }
            .build()
        
        _state.value = ConnectionState.Connecting
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _state.value = ConnectionState.Connected
                sendDeviceInfo()
                flushBuffer()
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _state.value = ConnectionState.Failed(t.message ?: "Unknown error")
                scheduleReconnect()
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _state.value = ConnectionState.Disconnected
            }
        })
    }
    
    /**
     * 发送事件
     */
    fun send(event: DebugEvent) {
        val message = Json.encodeToString(event.toBridgeMessage())
        
        if (_state.value == ConnectionState.Connected) {
            webSocket?.send(message)
        } else {
            synchronized(eventBuffer) {
                if (eventBuffer.size >= MAX_BUFFER_SIZE) {
                    eventBuffer.removeFirst()
                }
                eventBuffer.addLast(event)
            }
        }
    }
    
    /**
     * 处理服务端消息
     */
    private fun handleMessage(text: String) {
        val message = Json.decodeFromString<BridgeMessage>(text)
        
        when (message.type) {
            "pluginCommand" -> {
                val command = message.decodePayload<PluginCommand>()
                PluginManager.routeCommand(command)
            }
            "updateMockRules" -> {
                val rules = message.decodePayload<List<MockRule>>()
                MockPlugin.instance?.updateRules(rules)
            }
            "updateBreakpointRules" -> {
                val rules = message.decodePayload<List<BreakpointRule>>()
                BreakpointPlugin.instance?.updateRules(rules)
            }
            "updateChaosRules" -> {
                val rules = message.decodePayload<List<ChaosRule>>()
                ChaosPlugin.instance?.updateRules(rules)
            }
            "replayRequest" -> {
                val payload = message.decodePayload<ReplayRequestPayload>()
                replayRequest(payload)
            }
        }
    }
    
    companion object {
        private const val MAX_BUFFER_SIZE = 1000
    }
}
```

---

## 🚀 快速开始

### Gradle 依赖

```kotlin
// build.gradle.kts (app module)
dependencies {
    // 核心库（必需）
    debugImplementation("com.debugprobe:debugprobe:1.0.0")
    
    // OkHttp 拦截器（使用 OkHttp 时需要）
    debugImplementation("com.debugprobe:debugprobe-okhttp:1.0.0")
    
    // Timber 集成（使用 Timber 时需要）
    debugImplementation("com.debugprobe:debugprobe-timber:1.0.0")
}
```

### 初始化

```kotlin
// Application.kt
class MyApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        if (BuildConfig.DEBUG) {
            // 配置 DebugProbe
            DebugProbeSettings.apply {
                hubHost = "192.168.1.100"  // Debug Hub 地址
                hubPort = 9527
                token = "your-token"       // 可选
            }
            
            // 启动 DebugProbe
            DebugProbe.start(this)
            
            // 注册数据库（可选）
            DatabaseRegistry.autoDiscover(this)
            
            // 安装 Timber 日志树（可选）
            Timber.plant(DebugProbeTree())
        }
    }
}
```

### OkHttp 集成

```kotlin
// 创建 OkHttpClient
val okHttpClient = OkHttpClient.Builder()
    .apply {
        if (BuildConfig.DEBUG) {
            addInterceptor(DebugProbeInterceptor())
        }
    }
    .build()

// 用于 Retrofit
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.example.com")
    .client(okHttpClient)
    .build()
```

---

## 📡 消息协议

Android SDK 与 Debug Hub 使用相同的 WebSocket 消息协议，确保与 iOS SDK 完全兼容：

### 设备注册

```json
{
  "type": "register",
  "deviceId": "android-xxx-xxx",
  "payload": {
    "platform": "Android",
    "osVersion": "14",
    "appName": "MyApp",
    "appVersion": "1.0.0",
    "deviceModel": "Pixel 8",
    "sdkVersion": "1.0.0"
  }
}
```

### HTTP 事件

```json
{
  "type": "http",
  "deviceId": "android-xxx-xxx",
  "payload": {
    "id": "uuid",
    "url": "https://api.example.com/users",
    "method": "GET",
    "statusCode": 200,
    "requestHeaders": {},
    "responseHeaders": {},
    "requestBody": null,
    "responseBody": "{...}",
    "startTime": 1702300000000,
    "endTime": 1702300000150,
    "isMocked": false
  }
}
```

### 日志事件

```json
{
  "type": "log",
  "deviceId": "android-xxx-xxx",
  "payload": {
    "id": "uuid",
    "timestamp": 1702300000000,
    "level": "info",
    "tag": "MainActivity",
    "message": "User logged in",
    "thread": "main"
  }
}
```

---

## ✅ 开发清单

### Phase 1: 核心功能

- [ ] 项目结构搭建
- [ ] DebugProbe 主入口
- [ ] DebugBridgeClient WebSocket 通信
- [ ] 插件系统框架
- [ ] HttpPlugin + OkHttp 拦截器
- [ ] LogPlugin + Timber 集成
- [ ] 设备信息上报

### Phase 2: 高级功能

- [ ] DatabasePlugin + SQLite 检查器
- [ ] WebSocketPlugin
- [ ] MockPlugin
- [ ] BreakpointPlugin
- [ ] ChaosPlugin
- [ ] 事件持久化（Room）

### Phase 3: 完善与优化

- [ ] PerformancePlugin（CPU/内存/FPS）
- [ ] ProGuard 规则
- [ ] 文档和示例
- [ ] 单元测试
- [ ] Maven 发布

---

## 📚 参考资源

- [iOS DebugProbe SDK](../DebugProbe/README.md) - iOS 版实现参考
- [Debug Hub 协议](./PROMPTS.md) - 消息协议参考
- [OkHttp Interceptors](https://square.github.io/okhttp/features/interceptors/)
- [Timber](https://github.com/JakeWharton/timber)
- [Room Database](https://developer.android.com/training/data-storage/room)
